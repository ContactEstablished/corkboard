using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Commands;

public enum ItemResult
{
    Added,
    Reopened,
    AlreadyOpen,
    Removed,
    Completed,
    AlreadyCompleted,
    NotFound,
    Ambiguous,
}

/// <param name="Text">Display text of the matched item, or the spoken text when nothing matched.</param>
public sealed record ItemOutcome(string Text, ItemResult Result, IReadOnlyList<string>? Candidates = null)
{
    public bool Changed => Result is ItemResult.Added or ItemResult.Reopened or ItemResult.Removed or ItemResult.Completed;
}

public enum EffectKind
{
    ItemAdded,
    ItemReopened,
    ItemCompleted,
    ItemRemoved,
    ListCreated,
}

/// <summary>One reversible change, recorded in the command log so undo can revert it exactly.</summary>
public sealed record Effect(EffectKind Kind, Guid Id, DateTimeOffset? PreviousCompletedAt = null);

/// <summary>The shape stored in <see cref="CommandLog.ActionsJson"/>: what the user saw, plus how to undo it.</summary>
public sealed record LoggedAction(ActionDto Action, IReadOnlyList<Effect> Effects);

/// <summary>What happened for one parsed command. Everything the reply and the log need.</summary>
public sealed class ActionOutcome(ActionType type, string? requestedList)
{
    public ActionType Type { get; } = type;

    /// <summary>What the parser passed: a slug, an unknown list name, or null for the default list.</summary>
    public string? RequestedList { get; } = requestedList;

    /// <summary>The resolved list, or null when it doesn't exist (or the action isn't about one list).</summary>
    public KioskList? List { get; set; }

    public ActionStatus Status { get; set; } = ActionStatus.NoChange;

    public List<ItemOutcome> Items { get; } = [];

    public List<Effect> Effects { get; } = [];

    /// <summary>getList: the open items, oldest first.</summary>
    public IReadOnlyList<ListItem> OpenItems { get; set; } = [];

    /// <summary>getLists: the list names.</summary>
    public IReadOnlyList<string> ListNames { get; set; } = [];

    /// <summary>clearList.</summary>
    public int ClearedCount { get; set; }

    public bool CompletedOnly { get; set; }

    /// <summary>createList: the requested name.</summary>
    public string? Name { get; set; }

    /// <summary>undo: the reply of the command that was reverted.</summary>
    public string? UndoneReply { get; set; }

    /// <summary>The user named a list that doesn't exist.</summary>
    public bool ListMissing => Status == ActionStatus.NotFound && List is null && RequestedList is not null;

    /// <summary>Derives the action status from its items: applied if anything changed.</summary>
    public void SettleFromItems() =>
        Status = Items.Any(i => i.Changed) ? ActionStatus.Applied
            : Items.Any(i => i.Result == ItemResult.Ambiguous) ? ActionStatus.Ambiguous
            : Items.Any(i => i.Result == ItemResult.NotFound) ? ActionStatus.NotFound
            : ActionStatus.NoChange;

    public ActionDto ToDto()
    {
        IReadOnlyList<string> items = Type switch
        {
            ActionType.GetList => [.. OpenItems.Select(i => i.Text)],
            ActionType.GetLists => ListNames,
            ActionType.CreateList when Name is not null => [Name],
            _ => [.. Items.Select(i => i.Text)],
        };
        return new ActionDto(Type, List?.Slug ?? RequestedList, items, Status);
    }

    public LoggedAction ToLogged() => new(ToDto(), Effects);
}

public sealed class ExecutionResult
{
    public List<ActionOutcome> Actions { get; } = [];

    /// <summary>Lists whose items changed; each gets a <c>ListChanged</c> event.</summary>
    public HashSet<KioskList> ChangedLists { get; } = [];

    /// <summary>A list was created or removed; triggers <c>ListsChanged</c>.</summary>
    public bool ListsChanged { get; set; }

    /// <summary>The list the response shows: the first one any action resolved.</summary>
    public KioskList? MainList => Actions.Select(a => a.List).FirstOrDefault(l => l is { DeletedAt: null });
}
