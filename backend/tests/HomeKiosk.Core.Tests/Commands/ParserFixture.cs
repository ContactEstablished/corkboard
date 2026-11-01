using HomeKiosk.Core.Commands;
using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Tests.Commands;

internal static class ParserFixture
{
    /// <summary>The seeded lists, with a few open grocery items.</summary>
    public static readonly ParseContext Context = new(
        [
            new ListSummaryWithAliases("grocery", "Grocery", ["groceries", "food", "store", "shopping"]),
            new ListSummaryWithAliases("to-do", "To-do", ["todo", "to do", "chores"]),
        ],
        "grocery",
        new Dictionary<string, IReadOnlyList<string>>
        {
            ["grocery"] = ["Milk", "Eggs", "Bread", "Bananas", "Mac and cheese"],
            ["to-do"] = ["Call mom"],
        },
        CommandSource.Api,
        new DateTimeOffset(2026, 10, 31, 20, 0, 0, TimeSpan.Zero));

    /// <summary>A compact, comparable rendering: "AddItems(grocery, [milk, {eggs, a dozen}])".</summary>
    public static string Describe(ParseResult result) => string.Join(" + ", result.Commands.Select(Describe));

    private static string Describe(ListCommand command) => command switch
    {
        AddItems c => $"AddItems({c.List ?? "default"}, [{string.Join(", ", c.Items.Select(Describe))}])",
        RemoveItems c => $"RemoveItems({c.List ?? "default"}, [{string.Join(", ", c.Items)}])",
        CompleteItems c => $"CompleteItems({c.List ?? "default"}, [{string.Join(", ", c.Items)}])",
        GetList c => $"GetList({c.List ?? "default"})",
        GetLists => "GetLists",
        ClearList c => $"ClearList({c.List ?? "default"}, completedOnly: {(c.CompletedOnly ? "true" : "false")})",
        CreateList c => $"CreateList({c.Name})",
        Undo => "Undo",
        Unrecognized => "Unrecognized",
        _ => command.GetType().Name,
    };

    private static string Describe(ItemSpec item) => item.Quantity is null ? item.Text : $"{{{item.Text}, {item.Quantity}}}";
}
