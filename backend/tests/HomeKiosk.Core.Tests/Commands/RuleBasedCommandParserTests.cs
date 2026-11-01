using HomeKiosk.Core.Commands;
using static HomeKiosk.Core.Tests.Commands.ParserFixture;

namespace HomeKiosk.Core.Tests.Commands;

public sealed class RuleBasedCommandParserTests
{
    private readonly RuleBasedCommandParser _parser = new();

    /// <summary>Spec §6.6, the rows marked "rules".</summary>
    [Theory]
    [InlineData("add milk to the grocery list", "AddItems(grocery, [milk])")]
    [InlineData("add milk, eggs and bread", "AddItems(default, [milk, eggs, bread])")]
    [InlineData("put two gallons of milk on the list", "AddItems(default, [{milk, two gallons}])")]
    [InlineData("add drill bits to hardware", "AddItems(hardware, [drill bits])")]
    [InlineData("what's on the grocery list", "GetList(grocery)")]
    [InlineData("read me the list", "GetList(default)")]
    [InlineData("what lists do we have", "GetLists")]
    [InlineData("remove bananas", "RemoveItems(default, [bananas])")]
    [InlineData("take bananas off groceries", "RemoveItems(grocery, [bananas])")]
    [InlineData("check off eggs", "CompleteItems(default, [eggs])")]
    [InlineData("clear completed", "ClearList(default, completedOnly: true)")]
    [InlineData("clear the grocery list", "ClearList(grocery, completedOnly: false)")]
    [InlineData("create a list called camping", "CreateList(Camping)")]
    [InlineData("undo", "Undo")]
    [InlineData("never mind, undo that", "Undo")]
    public void Spec_rules_rows(string input, string expected) => AssertParses(input, expected);

    /// <summary>Spec §6.6 rows marked "llm" that the rules also cover, so they skip the LLM round trip.</summary>
    [Theory]
    [InlineData("we're out of coffee", "AddItems(default, [coffee])")]
    [InlineData("we need paper towels and dish soap", "AddItems(default, [paper towels, dish soap])")]
    [InlineData("I got the eggs", "CompleteItems(default, [eggs])")]
    [InlineData("add milk and check off bread", "AddItems(default, [milk]) + CompleteItems(default, [bread])")]
    public void Spec_llm_rows_the_rules_also_handle(string input, string expected) => AssertParses(input, expected);

    [Theory]
    [InlineData("")]
    [InlineData("um")]
    [InlineData("  Uh, hmm...  ")]
    public void Empty_or_filler_is_unrecognized_by_no_parser(string input)
    {
        var result = _parser.Parse(input, Context);

        Assert.Equal("Unrecognized", Describe(result));
        Assert.Equal(ParseResult.None, result.Parser);
        Assert.False(result.Understood);
    }

    [Theory]
    [InlineData("what's the weather")] // spec: left for the LLM, which calls no tools
    [InlineData("show me milk")]
    [InlineData("clear the table")]
    [InlineData("tell me a joke")]
    public void Off_topic_text_is_unrecognized(string input)
    {
        var result = _parser.Parse(input, Context);

        Assert.Equal("Unrecognized", Describe(result));
        Assert.Equal(ParseResult.None, result.Parser);
    }

    /// <summary>Speech-recognition output: casing, punctuation, filler and near-miss list names.</summary>
    [Theory]
    [InlineData("Add milk and eggs to the grocery list.", "AddItems(grocery, [milk, eggs])")]
    [InlineData("What's on the grocery list?", "GetList(grocery)")]
    [InlineData("Please add some milk.", "AddItems(default, [milk])")]
    [InlineData("hey, can you add bread to the shopping list please", "AddItems(grocery, [bread])")]
    [InlineData("add milk to the grocries list", "AddItems(grocery, [milk])")]
    [InlineData("add call mom to the to do list", "AddItems(to-do, [call mom])")]
    [InlineData("add batteries to my todo list", "AddItems(to-do, [batteries])")]
    [InlineData("Add bread, cheese, and crackers.", "AddItems(default, [bread, cheese, crackers])")]
    [InlineData("add milk & eggs", "AddItems(default, [milk, eggs])")]
    public void Speech_style_input(string input, string expected) => AssertParses(input, expected);

    [Theory]
    [InlineData("add a dozen eggs", "AddItems(default, [{eggs, a dozen}])")]
    [InlineData("add 3 avocados", "AddItems(default, [{avocados, 3}])")]
    [InlineData("add 2 lbs of ground beef", "AddItems(default, [{ground beef, 2 lbs}])")]
    [InlineData("add a bag of chips and two cans of tuna", "AddItems(default, [{chips, a bag}, {tuna, two cans}])")]
    [InlineData("add an apple", "AddItems(default, [apple])")]
    public void Quantities_are_split_from_the_item(string input, string expected) => AssertParses(input, expected);

    [Theory]
    [InlineData("add mac and cheese and apples", "AddItems(default, [mac and cheese, apples])")]
    [InlineData("check off mac and cheese", "CompleteItems(default, [mac and cheese])")]
    [InlineData("add salt and pepper", "AddItems(default, [salt and pepper])")]
    public void Known_and_phrases_stay_one_item(string input, string expected) => AssertParses(input, expected);

    [Theory]
    [InlineData("show me the grocery list", "GetList(grocery)")]
    [InlineData("grocery list", "GetList(grocery)")]
    [InlineData("what's on the list", "GetList(default)")]
    [InlineData("what do we need", "GetList(default)")]
    [InlineData("what's on the camping list", "GetList(camping)")]
    [InlineData("get me the to do list", "GetList(to-do)")]
    [InlineData("show me all the lists", "GetLists")]
    [InlineData("how many lists do we have", "GetLists")]
    public void Reading(string input, string expected) => AssertParses(input, expected);

    [Theory]
    [InlineData("remove milk from the grocery list", "RemoveItems(grocery, [milk])")]
    [InlineData("delete eggs and bread", "RemoveItems(default, [eggs, bread])")]
    [InlineData("we don't need bananas anymore", "RemoveItems(default, [bananas])")]
    [InlineData("take off the milk", "RemoveItems(default, [milk])")]
    [InlineData("check eggs off the list", "CompleteItems(default, [eggs])")]
    [InlineData("check off the milk and the eggs", "CompleteItems(default, [milk, eggs])")]
    [InlineData("cross off call mom on the to do list", "CompleteItems(to-do, [call mom])")]
    [InlineData("mark bread as done", "CompleteItems(default, [bread])")]
    [InlineData("bought milk", "CompleteItems(default, [milk])")]
    [InlineData("milk is done", "CompleteItems(default, [milk])")]
    public void Removing_and_completing(string input, string expected) => AssertParses(input, expected);

    [Theory]
    [InlineData("get milk", "AddItems(default, [milk])")]
    [InlineData("pick up paper towels", "AddItems(default, [paper towels])")]
    [InlineData("we're running low on coffee", "AddItems(default, [coffee])")]
    [InlineData("I need to buy batteries", "AddItems(default, [batteries])")]
    [InlineData("need more milk", "AddItems(default, [milk])")]
    public void Other_ways_to_add(string input, string expected) => AssertParses(input, expected);

    [Theory]
    [InlineData("make a camping list", "CreateList(Camping)")]
    [InlineData("start a new list called hardware store", "CreateList(Hardware store)")]
    [InlineData("new list birthday party", "CreateList(Birthday party)")]
    [InlineData("clear the list", "ClearList(default, completedOnly: false)")]
    [InlineData("remove the checked off items from groceries", "ClearList(grocery, completedOnly: true)")]
    [InlineData("delete everything from the to do list", "ClearList(to-do, completedOnly: false)")]
    [InlineData("take that back", "Undo")]
    [InlineData("oops, undo the last change", "Undo")]
    public void Lists_and_undo(string input, string expected) => AssertParses(input, expected);

    [Fact]
    public void More_than_25_items_is_rejected()
    {
        var items = string.Join(", ", Enumerable.Range(1, 26).Select(i => $"thing{i}"));

        var result = _parser.Parse($"add {items}", Context);

        Assert.Equal("Unrecognized", Describe(result));
    }

    [Fact]
    public void Item_text_over_100_characters_is_rejected()
    {
        var result = _parser.Parse($"add {new string('x', 101)}", Context);

        Assert.Equal("Unrecognized", Describe(result));
    }

    private void AssertParses(string input, string expected)
    {
        var result = _parser.Parse(input, Context);

        Assert.Equal(expected, Describe(result));
        Assert.Equal(RuleBasedCommandParser.ParserName, result.Parser);
    }
}
