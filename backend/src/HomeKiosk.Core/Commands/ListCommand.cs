using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Commands;

/// <summary>
/// One parsed intent. <c>List</c> is a slug when the parser recognized the list, the name the user said
/// when it didn't (the executor replies "I don't have a list called …"), or null for the default list.
/// </summary>
public abstract record ListCommand;

public sealed record AddItems(string? List, IReadOnlyList<ItemSpec> Items) : ListCommand;

public sealed record RemoveItems(string? List, IReadOnlyList<string> Items) : ListCommand;

public sealed record CompleteItems(string? List, IReadOnlyList<string> Items) : ListCommand;

public sealed record GetList(string? List) : ListCommand;

public sealed record GetLists : ListCommand;

public sealed record ClearList(string? List, bool CompletedOnly) : ListCommand;

public sealed record CreateList(string Name) : ListCommand;

public sealed record Undo : ListCommand;

public sealed record Unrecognized(string Reason) : ListCommand;

public sealed record ItemSpec(string Text, string? Quantity = null);

/// <param name="Parser">"rules" | "llm" | "none" (nothing understood the text).</param>
public sealed record ParseResult(IReadOnlyList<ListCommand> Commands, string Parser)
{
    public const string None = "none";

    public bool Understood => Commands.Any(c => c is not Unrecognized);

    public static ParseResult NotUnderstood(string reason) => new([new Unrecognized(reason)], None);
}

public sealed record ListSummaryWithAliases(string Slug, string Name, IReadOnlyList<string> Aliases);

/// <summary>What a parser may need to resolve references ("check off the milk", "the shopping list").</summary>
public sealed record ParseContext(
    IReadOnlyList<ListSummaryWithAliases> Lists,
    string DefaultListSlug,
    IReadOnlyDictionary<string, IReadOnlyList<string>> OpenItemsByList,
    CommandSource Source,
    DateTimeOffset Now);

public interface ICommandParser
{
    Task<ParseResult> ParseAsync(string text, ParseContext context, CancellationToken ct);
}
