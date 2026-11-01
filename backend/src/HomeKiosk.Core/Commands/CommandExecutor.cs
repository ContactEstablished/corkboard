using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using HomeKiosk.Core.Lists;
using HomeKiosk.Core.Matching;

namespace HomeKiosk.Core.Commands;

/// <summary>
/// Applies the commands of one utterance to tracked entities. Nothing is saved here: the caller commits
/// every change together with the command log in one transaction. Each change stamps the command's ID
/// on the item and records an <see cref="Effect"/> so undo can revert it.
/// </summary>
public sealed class CommandExecutor(IKioskRepository repository, IClock clock)
{
    /// <summary>How far back undo looks for the latest change. Reads in between don't count.</summary>
    private const int UndoLookback = 50;

    /// <param name="lists">Every live list with its items, tracked. Created lists are appended.</param>
    public async Task<ExecutionResult> ExecuteAsync(
        IReadOnlyList<ListCommand> commands,
        List<KioskList> lists,
        Guid commandId,
        CommandOrigin origin,
        CancellationToken ct)
    {
        var run = new Run(lists, commandId, origin, clock.UtcNow, new ExecutionResult());
        foreach (var command in commands)
        {
            var outcome = command switch
            {
                AddItems c => Add(run, c),
                RemoveItems c => Remove(run, c),
                CompleteItems c => Complete(run, c),
                GetList c => Read(run, c),
                GetLists => ReadAll(run),
                ClearList c => Clear(run, c),
                CreateList c => Create(run, c),
                Undo => await UndoAsync(run, ct),
                _ => null,
            };

            if (outcome is not null)
            {
                run.Result.Actions.Add(outcome);
            }
        }

        return run.Result;
    }

    private sealed record Run(List<KioskList> Lists, Guid CommandId, CommandOrigin Origin, DateTimeOffset Now, ExecutionResult Result)
    {
        public IEnumerable<KioskList> Live => Lists.Where(l => l.DeletedAt is null);

        /// <summary>null → the default list; otherwise slug, name or alias, then fuzzy. Never creates.</summary>
        public KioskList? Resolve(string? requested)
        {
            if (requested is null)
            {
                return Live.FirstOrDefault(l => l.IsDefault) ?? Live.FirstOrDefault();
            }

            var match = ListResolver.Resolve(requested, Live.Select(Summary));
            return match is null ? null : Live.First(l => l.Slug == match.Slug);
        }

        public void Touched(KioskList list, ListItem item)
        {
            item.LastCommandId = CommandId;
            Result.ChangedLists.Add(list);
        }
    }

    internal static ListSummaryWithAliases Summary(KioskList list) => new(list.Slug, list.Name, list.Aliases);

    private ActionOutcome Add(Run run, AddItems command)
    {
        var outcome = new ActionOutcome(ActionType.AddItems, command.List);
        if (ResolveOrMissing(run, outcome, command.List) is not { } list)
        {
            return outcome;
        }

        foreach (var spec in command.Items)
        {
            var text = TextNormalizer.ToDisplay(spec.Text);
            if (text.Length == 0)
            {
                continue;
            }

            var (item, added, previousCompletedAt) = ItemOperations.AddOrReopen(
                repository,
                list,
                text,
                TextNormalizer.Normalize(spec.Text),
                string.IsNullOrWhiteSpace(spec.Quantity) ? null : spec.Quantity.Trim(),
                run.Origin.UserName,
                run.Origin.Source,
                run.Now,
                run.CommandId);

            switch (added)
            {
                case AddOutcome.Added:
                    outcome.Effects.Add(new Effect(EffectKind.ItemAdded, item.Id));
                    outcome.Items.Add(new ItemOutcome(item.Text, ItemResult.Added));
                    run.Touched(list, item);
                    break;
                case AddOutcome.Reopened:
                    outcome.Effects.Add(new Effect(EffectKind.ItemReopened, item.Id, previousCompletedAt));
                    outcome.Items.Add(new ItemOutcome(item.Text, ItemResult.Reopened));
                    run.Touched(list, item);
                    break;
                default:
                    outcome.Items.Add(new ItemOutcome(item.Text, ItemResult.AlreadyOpen));
                    break;
            }
        }

        outcome.SettleFromItems();
        return outcome;
    }

    private static ActionOutcome Remove(Run run, RemoveItems command)
    {
        var outcome = new ActionOutcome(ActionType.RemoveItems, command.List);
        if (ResolveOrMissing(run, outcome, command.List) is not { } list)
        {
            return outcome;
        }

        foreach (var query in command.Items)
        {
            // Prefer open items; a completed one can still be removed by name.
            var matches = Match(query, Open(list));
            if (matches.Count == 0)
            {
                matches = Match(query, Completed(list));
            }

            if (Unique(outcome, query, matches) is { } item)
            {
                item.DeletedAt = run.Now;
                run.Touched(list, item);
                outcome.Effects.Add(new Effect(EffectKind.ItemRemoved, item.Id));
                outcome.Items.Add(new ItemOutcome(item.Text, ItemResult.Removed));
            }
        }

        outcome.SettleFromItems();
        return outcome;
    }

    private static ActionOutcome Complete(Run run, CompleteItems command)
    {
        var outcome = new ActionOutcome(ActionType.CompleteItems, command.List);
        if (ResolveOrMissing(run, outcome, command.List) is not { } list)
        {
            return outcome;
        }

        foreach (var query in command.Items)
        {
            var matches = Match(query, Open(list));
            if (matches.Count == 0 && Match(query, Completed(list)) is [var done, ..])
            {
                outcome.Items.Add(new ItemOutcome(done.Text, ItemResult.AlreadyCompleted));
                continue;
            }

            if (Unique(outcome, query, matches) is { } item)
            {
                item.IsCompleted = true;
                item.CompletedAt = run.Now;
                run.Touched(list, item);
                outcome.Effects.Add(new Effect(EffectKind.ItemCompleted, item.Id));
                outcome.Items.Add(new ItemOutcome(item.Text, ItemResult.Completed));
            }
        }

        outcome.SettleFromItems();
        return outcome;
    }

    private static ActionOutcome Read(Run run, GetList command)
    {
        var outcome = new ActionOutcome(ActionType.GetList, command.List);
        if (ResolveOrMissing(run, outcome, command.List) is { } list)
        {
            outcome.OpenItems = [.. Open(list).OrderBy(i => i.CreatedAt).ThenBy(i => i.Id)];
            outcome.Status = ActionStatus.Applied;
        }

        return outcome;
    }

    private static ActionOutcome ReadAll(Run run) =>
        new(ActionType.GetLists, null)
        {
            ListNames = [.. ListMapper.ToSummaries(run.Live).Select(l => l.Name)],
            Status = ActionStatus.Applied,
        };

    private static ActionOutcome Clear(Run run, ClearList command)
    {
        var outcome = new ActionOutcome(ActionType.ClearList, command.List) { CompletedOnly = command.CompletedOnly };
        if (ResolveOrMissing(run, outcome, command.List) is not { } list)
        {
            return outcome;
        }

        foreach (var item in command.CompletedOnly ? Completed(list) : Live(list).ToList())
        {
            item.DeletedAt = run.Now;
            run.Touched(list, item);
            outcome.Effects.Add(new Effect(EffectKind.ItemRemoved, item.Id));
        }

        outcome.ClearedCount = outcome.Effects.Count;
        outcome.Status = outcome.ClearedCount > 0 ? ActionStatus.Applied : ActionStatus.NoChange;
        return outcome;
    }

    private ActionOutcome Create(Run run, CreateList command)
    {
        var name = TextNormalizer.ToDisplay(command.Name);
        var slug = SlugGenerator.FromName(name);
        var outcome = new ActionOutcome(ActionType.CreateList, slug) { Name = name };
        if (slug.Length == 0 || name.Length > ListService.MaxListNameLength)
        {
            outcome.Status = ActionStatus.Failed;
            return outcome;
        }

        // Any exact name, slug or alias clash means "you already have it": spoken names must stay unambiguous.
        if (ListResolver.ResolveExact(name, run.Live.Select(Summary)) is { } existing)
        {
            outcome.List = run.Live.First(l => l.Slug == existing.Slug);
            return outcome;
        }

        var list = new KioskList
        {
            Id = Guid.CreateVersion7(run.Now),
            Name = name,
            Slug = slug,
            CreatedAt = run.Now,
            IsDefault = false,
        };
        repository.Add(list);
        run.Lists.Add(list);
        run.Result.ListsChanged = true;
        outcome.List = list;
        outcome.Effects.Add(new Effect(EffectKind.ListCreated, list.Id));
        outcome.Status = ActionStatus.Applied;
        return outcome;
    }

    /// <summary>
    /// Reverts the most recent command that changed something. Only one step: if that command was itself
    /// an undo, there is nothing (more) to undo.
    /// </summary>
    private async Task<ActionOutcome> UndoAsync(Run run, CancellationToken ct)
    {
        var outcome = new ActionOutcome(ActionType.Undo, null);

        CommandLog? target = null;
        IReadOnlyList<LoggedAction> actions = [];
        foreach (var log in await repository.GetRecentCommandsAsync(UndoLookback, ct))
        {
            actions = CommandJson.Deserialize(log.ActionsJson);
            if (actions.Any(a => a.Action.Status == ActionStatus.Applied && (a.Effects.Count > 0 || a.Action.Type == ActionType.Undo)))
            {
                target = log;
                break;
            }
        }

        if (target is null || target.Undone || actions.Any(a => a.Action.Type == ActionType.Undo))
        {
            return outcome; // NoChange: "There's nothing to undo."
        }

        var effects = actions.SelectMany(a => a.Effects).Reverse().ToList();
        var items = (await repository.GetItemsIncludingDeletedAsync([.. effects.Select(e => e.Id)], ct)).ToDictionary(i => i.Id);

        foreach (var effect in effects)
        {
            if (effect.Kind == EffectKind.ListCreated)
            {
                if (run.Live.FirstOrDefault(l => l.Id == effect.Id) is { } created)
                {
                    created.DeletedAt = run.Now;
                    run.Result.ListsChanged = true;
                    run.Result.ChangedLists.Remove(created);
                }

                continue;
            }

            if (!items.TryGetValue(effect.Id, out var item))
            {
                continue;
            }

            switch (effect.Kind)
            {
                case EffectKind.ItemAdded:
                    item.DeletedAt = run.Now;
                    break;
                case EffectKind.ItemRemoved:
                    item.DeletedAt = null;
                    break;
                case EffectKind.ItemCompleted:
                    item.IsCompleted = false;
                    item.CompletedAt = null;
                    break;
                case EffectKind.ItemReopened:
                    item.IsCompleted = true;
                    item.CompletedAt = effect.PreviousCompletedAt ?? run.Now;
                    break;
            }

            item.LastCommandId = run.CommandId;
            if (run.Live.FirstOrDefault(l => l.Id == item.ListId) is { } list)
            {
                run.Result.ChangedLists.Add(list);
                outcome.List ??= list;
            }
        }

        target.Undone = true;
        outcome.UndoneReply = target.Reply;
        outcome.Status = ActionStatus.Applied;
        return outcome;
    }

    /// <summary>Resolves the action's list, or marks the action "list not found".</summary>
    private static KioskList? ResolveOrMissing(Run run, ActionOutcome outcome, string? requested)
    {
        outcome.List = run.Resolve(requested);
        if (outcome.List is null)
        {
            outcome.Status = ActionStatus.NotFound;
        }

        return outcome.List;
    }

    /// <summary>Records not-found or ambiguous for zero or several matches; returns the single match.</summary>
    private static ListItem? Unique(ActionOutcome outcome, string query, IReadOnlyList<ListItem> matches)
    {
        switch (matches.Count)
        {
            case 1:
                return matches[0];
            case 0:
                outcome.Items.Add(new ItemOutcome(query, ItemResult.NotFound));
                return null;
            default:
                // In list order, so "which apples: green apples or red apples?" matches what's on screen.
                var candidates = matches.OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).Select(m => m.Text);
                outcome.Items.Add(new ItemOutcome(query, ItemResult.Ambiguous, [.. candidates]));
                return null;
        }
    }

    private static IReadOnlyList<ListItem> Match(string query, IReadOnlyList<ListItem> items) =>
        ItemResolver.Resolve(query, items, i => i.NormalizedText);

    private static IEnumerable<ListItem> Live(KioskList list) => list.Items.Where(i => i.DeletedAt is null);

    private static List<ListItem> Open(KioskList list) => [.. Live(list).Where(i => !i.IsCompleted)];

    private static List<ListItem> Completed(KioskList list) => [.. Live(list).Where(i => i.IsCompleted)];
}
