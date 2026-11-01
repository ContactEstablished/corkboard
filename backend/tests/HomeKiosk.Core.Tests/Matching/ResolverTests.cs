using HomeKiosk.Core.Matching;
using HomeKiosk.Core.Tests.Commands;

namespace HomeKiosk.Core.Tests.Matching;

public sealed class ResolverTests
{
    [Theory]
    [InlineData("grocery", "grocery")]
    [InlineData("Groceries", "grocery")]
    [InlineData("the shopping list", "grocery")]
    [InlineData("grocry", "grocery")] // speech-recognition slip
    [InlineData("to do", "to-do")]
    [InlineData("To-Do list", "to-do")]
    [InlineData("chores", "to-do")]
    [InlineData("hardware", null)]
    [InlineData("the list", null)] // the default list, not a named one
    public void Lists_resolve_by_slug_name_alias_then_fuzzy(string spoken, string? expectedSlug) =>
        Assert.Equal(expectedSlug, ListResolver.Resolve(spoken, ParserFixture.Context.Lists)?.Slug);

    [Theory]
    [InlineData("milk", new[] { "Milk", "Almond milk" }, new[] { "Milk" })] // exact beats contains
    [InlineData("banana", new[] { "Bananas", "Bread" }, new[] { "Bananas" })]
    [InlineData("tomato", new[] { "Tomatoes" }, new[] { "Tomatoes" })]
    [InlineData("berry", new[] { "Berries" }, new[] { "Berries" })]
    [InlineData("shoe", new[] { "Shoes" }, new[] { "Shoes" })]
    [InlineData("apples", new[] { "Green apples", "Red apples", "Milk" }, new[] { "Green apples", "Red apples" })]
    [InlineData("coffee", new[] { "Ground coffee" }, new[] { "Ground coffee" })]
    [InlineData("mlk", new[] { "Milk" }, new[] { "Milk" })]
    [InlineData("egg", new[] { "Eel" }, new string[0])] // short words allow only one edit
    [InlineData("cereal", new[] { "Milk", "Bread" }, new string[0])]
    public void Items_resolve_in_stages(string query, string[] items, string[] expected)
    {
        var matches = ItemResolver.Resolve(query, items, TextNormalizer.Normalize);

        Assert.Equal(expected, matches);
    }
}
