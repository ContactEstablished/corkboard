using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using HomeKiosk.Core.Matching;

namespace HomeKiosk.Core.Commands;

/// <summary>Short, speakable replies for the kiosk and HTTP. One sentence per outcome where possible.</summary>
public static class ReplyFormatter
{
    public const string NotUnderstood = "I didn't catch that. Try 'add milk to the grocery list'.";
    public const string NotHeard = "I didn't catch that."; // voice: too short, or no words in the transcript
    public const string Failed = "Sorry, something went wrong. Nothing was changed.";
    public const string NothingToUndo = "There's nothing to undo.";

    public static string Format(ExecutionResult result)
    {
        if (result.Actions.Count == 0)
        {
            return NotUnderstood;
        }

        if (result.Actions.Any(a => a.Status == ActionStatus.Failed))
        {
            return Failed;
        }

        return string.Join(' ', result.Actions.Select(Format).Where(s => !string.IsNullOrEmpty(s)));
    }

    private static string? Format(ActionOutcome action)
    {
        if (action.ListMissing)
        {
            var name = TextNormalizer.ToDisplay(action.RequestedList);
            return $"I don't have a list called {name}. Say 'create a list called {name}' to add it.";
        }

        var list = action.List?.Name ?? "";
        return action.Type switch
        {
            ActionType.AddItems => Sentences(
                Named(action, ItemResult.Added, ItemResult.Reopened) is { } added ? $"Added {added} to {list}." : null,
                Named(action, ItemResult.AlreadyOpen) is { } open ? $"{Capitalize(open)} {IsAre(action, ItemResult.AlreadyOpen)} already on {list}." : null),

            ActionType.RemoveItems => Sentences(
                Named(action, ItemResult.Removed) is { } removed ? $"Removed {removed} from {list}." : null,
                Missing(action, list)),

            ActionType.CompleteItems => Sentences(
                Named(action, ItemResult.Completed) is { } done ? $"Checked off {done}." : null,
                Named(action, ItemResult.AlreadyCompleted) is { } already
                    ? $"{Capitalize(already)} {IsAre(action, ItemResult.AlreadyCompleted)} already checked off."
                    : null,
                Missing(action, list)),

            ActionType.GetList => action.OpenItems.Count switch
            {
                0 => $"{list} is empty.",
                var n => $"{list} has {n} item{Plural(n)}: {string.Join(", ", action.OpenItems.Select(Spoken))}.",
            },

            ActionType.GetLists => action.ListNames.Count switch
            {
                0 => "You don't have any lists.",
                var n => $"You have {n} list{Plural(n)}: {Join(action.ListNames, "and")}.",
            },

            ActionType.ClearList => (action.CompletedOnly, action.ClearedCount) switch
            {
                (true, 0) => $"There are no completed items on {list}.",
                (true, var n) => $"Cleared {n} completed item{Plural(n)} from {list}.",
                (false, 0) => $"{list} is already empty.",
                (false, var n) => $"Cleared all {n} item{Plural(n)} from {list}.",
            },

            ActionType.CreateList => action.Status == ActionStatus.Applied
                ? $"Created the {list} list."
                : $"You already have a list called {list}.",

            ActionType.Undo => action.Status == ActionStatus.Applied
                ? $"Undid the last change: {action.UndoneReply}"
                : NothingToUndo,

            _ => "",
        };
    }

    /// <summary>
    /// The reply as Telegram HTML (<c>parse_mode = HTML</c>). Reading one list gives a bold name and a bullet per
    /// open item, with its quantity in parentheses; everything else is the spoken reply, escaped.
    /// </summary>
    public static string ForTelegram(CommandResponse response)
    {
        if (response is not { Actions: [{ Type: ActionType.GetList, Status: ActionStatus.Applied }], List: { } list })
        {
            return Html(response.Reply);
        }

        var open = list.Items.Where(i => !i.IsCompleted).ToList();
        if (open.Count == 0)
        {
            return $"<b>{Html(list.Name)}</b> is empty.";
        }

        var bullets = open.Select(i => i.Quantity is null ? $"• {Html(i.Text)}" : $"• {Html(i.Text)} ({Html(i.Quantity)})");
        return $"<b>{Html(list.Name)}</b>\n{string.Join('\n', bullets)}";
    }

    /// <summary>Escapes the three characters Telegram's HTML mode requires escaping.</summary>
    public static string Html(string text) => text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

    /// <summary>Not-found and ambiguous items, phrased as a question when there are candidates.</summary>
    private static string? Missing(ActionOutcome action, string list)
    {
        var parts = new List<string?>
        {
            Named(action, ItemResult.NotFound) is { } missing ? $"I couldn't find {missing} on {list}." : null,
        };
        parts.AddRange(action.Items
            .Where(i => i.Result == ItemResult.Ambiguous)
            .Select(i => $"Which {i.Text} did you mean: {Join(i.Candidates!.Select(Inline), "or")}?"));
        return Sentences([.. parts]);
    }

    private static string? Named(ActionOutcome action, params ItemResult[] results)
    {
        var names = action.Items.Where(i => results.Contains(i.Result)).Select(i => Inline(i.Text)).Distinct().ToList();
        return names.Count == 0 ? null : Join(names, "and");
    }

    private static string IsAre(ActionOutcome action, ItemResult result) =>
        action.Items.Count(i => i.Result == result) == 1 ? "is" : "are";

    private static string? Sentences(params string?[] sentences)
    {
        var joined = string.Join(' ', sentences.Where(s => !string.IsNullOrEmpty(s)));
        return joined.Length == 0 ? null : joined;
    }

    private static string Spoken(ListItem item) =>
        item.Quantity is null ? Inline(item.Text) : $"{Inline(item.Text)} ({item.Quantity})";

    /// <summary>"Milk" → "milk" mid-sentence, but keeps "TV remote" and "iPhone charger" as they are.</summary>
    internal static string Inline(string text) =>
        text.Length > 1 && char.IsUpper(text[0]) && !char.IsUpper(text[1]) ? char.ToLowerInvariant(text[0]) + text[1..] : text;

    private static string Capitalize(string text) => text.Length == 0 ? text : char.ToUpperInvariant(text[0]) + text[1..];

    /// <summary>"a", "a and b", "a, b and c".</summary>
    internal static string Join(IEnumerable<string> items, string conjunction)
    {
        var list = items.ToList();
        return list.Count switch
        {
            0 => "",
            1 => list[0],
            _ => $"{string.Join(", ", list[..^1])} {conjunction} {list[^1]}",
        };
    }

    private static string Plural(int n) => n == 1 ? "" : "s";
}
