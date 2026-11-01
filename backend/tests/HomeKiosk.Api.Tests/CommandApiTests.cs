using System.Net;
using System.Net.Http.Json;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;

namespace HomeKiosk.Api.Tests;

/// <summary>The command pipeline end to end: parse → execute → log → reply, over a real database.</summary>
public sealed class CommandApiTests : IAsyncLifetime
{
    private readonly KioskApiFactory _factory = new();
    private HttpClient _client = null!;

    public ValueTask InitializeAsync()
    {
        _client = _factory.CreateKioskClient();
        return ValueTask.CompletedTask;
    }

    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Adding_by_command_applies_and_replies()
    {
        var response = await SayAsync("Add milk and eggs to the grocery list.");

        Assert.True(response.Understood);
        Assert.Equal("Added milk and eggs to Grocery.", response.Reply);
        var action = Assert.Single(response.Actions);
        Assert.Equal((ActionType.AddItems, "grocery", ActionStatus.Applied), (action.Type, action.List, action.Status));
        Assert.Equal(["Milk", "Eggs"], action.Items);
        Assert.Equal(CommandSource.Api, response.Source);
        Assert.Equal("Kiosk", response.AddedBy);
        Assert.Null(response.Transcript);
        Assert.Equal(["Milk", "Eggs"], response.List!.Items.Select(i => i.Text));
        Assert.All(response.List.Items, i => Assert.Equal(CommandSource.Api, i.Source));
    }

    [Fact]
    public async Task Adding_an_item_already_on_the_list_changes_nothing()
    {
        await SayAsync("add milk");

        var response = await SayAsync("add some milk and bread");

        Assert.Equal("Added bread to Grocery. Milk is already on Grocery.", response.Reply);
        Assert.Equal(ActionStatus.Applied, response.Actions[0].Status);
        Assert.Equal("Milk is already on Grocery.", (await SayAsync("add milk")).Reply);
        Assert.Equal(ActionStatus.NoChange, (await SayAsync("add milk")).Actions[0].Status);
    }

    [Fact]
    public async Task An_unknown_list_is_not_created()
    {
        var response = await SayAsync("add drill bits to hardware");

        Assert.Equal("I don't have a list called Hardware. Say 'create a list called Hardware' to add it.", response.Reply);
        var action = Assert.Single(response.Actions);
        Assert.Equal((ActionType.AddItems, "hardware", ActionStatus.NotFound), (action.Type, action.List, action.Status));
        Assert.Null(response.List);
        Assert.Equal(2, (await _client.GetFromJsonAsync<List<ListSummary>>("/api/lists", KioskApiFactory.Json, Ct))!.Count);
    }

    [Fact]
    public async Task Reading_lists()
    {
        await SayAsync("add milk, put two gallons of water on the list");

        Assert.Equal("Grocery has 2 items: milk, water (two gallons).", (await SayAsync("what's on the grocery list")).Reply);
        Assert.Equal("To-do is empty.", (await SayAsync("read me the to do list")).Reply);
        Assert.Equal("You have 2 lists: Grocery and To-do.", (await SayAsync("what lists do we have")).Reply);
    }

    [Fact]
    public async Task Checking_off_and_removing()
    {
        await SayAsync("add bread, bananas and eggs");

        Assert.Equal("Checked off bread.", (await SayAsync("I got the bread")).Reply);
        Assert.Equal("Bread is already checked off.", (await SayAsync("check off bread")).Reply);
        Assert.Equal("Removed bananas from Grocery.", (await SayAsync("take banana off groceries")).Reply);

        var missing = await SayAsync("remove cereal");
        Assert.Equal("I couldn't find cereal on Grocery.", missing.Reply);
        Assert.Equal(ActionStatus.NotFound, missing.Actions[0].Status);

        var list = await _client.GetFromJsonAsync<ListDetail>("/api/lists/grocery", KioskApiFactory.Json, Ct);
        Assert.Equal([("Eggs", false), ("Bread", true)], list!.Items.Select(i => (i.Text, i.IsCompleted)));
    }

    [Fact]
    public async Task Ambiguous_items_are_not_guessed()
    {
        await SayAsync("add green apples and red apples");

        var response = await SayAsync("check off apples");

        Assert.Equal(ActionStatus.Ambiguous, response.Actions[0].Status);
        Assert.Equal("Which apples did you mean: green apples or red apples?", response.Reply);
        Assert.All(response.List!.Items, i => Assert.False(i.IsCompleted));
    }

    [Fact]
    public async Task Several_commands_in_one_utterance()
    {
        await SayAsync("add bread");

        var response = await SayAsync("add milk and check off bread");

        Assert.Equal("Added milk to Grocery. Checked off bread.", response.Reply);
        Assert.Equal([ActionType.AddItems, ActionType.CompleteItems], response.Actions.Select(a => a.Type));
    }

    [Fact]
    public async Task Creating_and_clearing_lists()
    {
        var created = await SayAsync("create a list called camping");
        Assert.Equal("Created the Camping list.", created.Reply);
        Assert.Equal("camping", created.List!.Slug);
        Assert.Equal("You already have a list called Camping.", (await SayAsync("make a camping list")).Reply);

        await SayAsync("add tent and stove to the camping list");
        await SayAsync("check off tent on camping");
        Assert.Equal("Cleared 1 completed item from Camping.", (await SayAsync("clear completed from camping")).Reply);
        Assert.Equal("Cleared all 1 item from Camping.", (await SayAsync("clear the camping list")).Reply);
        Assert.Equal("Camping is already empty.", (await SayAsync("clear the camping list")).Reply);
    }

    [Fact]
    public async Task Undo_reverts_only_the_last_change()
    {
        await SayAsync("add milk");
        await SayAsync("add eggs");
        await SayAsync("what's on the list"); // reads don't count as the last change

        var undo = await PostAsync("/api/undo");

        Assert.Equal("Undid the last change: Added eggs to Grocery.", undo.Reply);
        Assert.Equal([ActionType.Undo], undo.Actions.Select(a => a.Type));
        Assert.Equal(["Milk"], undo.List!.Items.Select(i => i.Text));

        Assert.Equal("There's nothing to undo.", (await SayAsync("undo")).Reply);
        Assert.Equal(["Milk"], (await GetGroceryAsync()).Items.Select(i => i.Text));
    }

    [Fact]
    public async Task Undo_restores_cleared_and_completed_items()
    {
        await SayAsync("add milk, eggs and bread");
        await SayAsync("check off milk and eggs");
        await SayAsync("clear completed");
        Assert.Equal(["Bread"], (await GetGroceryAsync()).Items.Select(i => i.Text));

        await SayAsync("never mind, undo that");
        Assert.Equal(3, (await GetGroceryAsync()).Items.Count);

        await SayAsync("check off bread");
        await SayAsync("undo");
        Assert.False((await GetGroceryAsync()).Items.Single(i => i.Text == "Bread").IsCompleted);
    }

    [Fact]
    public async Task Undo_of_reopening_completes_the_item_again()
    {
        await SayAsync("add milk");
        await SayAsync("check off milk");
        Assert.Equal("Added milk to Grocery.", (await SayAsync("add milk")).Reply); // reopened, not duplicated

        await SayAsync("undo");

        var milk = Assert.Single((await GetGroceryAsync()).Items);
        Assert.True(milk.IsCompleted);
    }

    [Fact]
    public async Task Undo_removes_a_created_list()
    {
        await SayAsync("create a list called camping");

        await SayAsync("undo");

        var lists = await _client.GetFromJsonAsync<List<ListSummary>>("/api/lists", KioskApiFactory.Json, Ct);
        Assert.DoesNotContain(lists!, l => l.Slug == "camping");
    }

    [Theory]
    [InlineData("")]
    [InlineData("um")]
    [InlineData("what's the weather")]
    public async Task Unrecognized_text_gets_a_hint(string text)
    {
        var response = await SayAsync(text);

        Assert.False(response.Understood);
        Assert.Empty(response.Actions);
        Assert.Equal("I didn't catch that. Try 'add milk to the grocery list'.", response.Reply);
        Assert.Null(response.List);
    }

    [Fact]
    public async Task Overlong_text_is_rejected()
    {
        var response = await _client.PostAsJsonAsync("/api/commands", new { text = new string('a', 501) }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Recent_commands_are_logged_newest_first()
    {
        await SayAsync("add milk");
        await SayAsync("um");
        await PostAsync("/api/undo");

        var recent = await _client.GetFromJsonAsync<List<CommandLogSummary>>("/api/commands/recent?take=2", KioskApiFactory.Json, Ct);

        Assert.Collection(
            recent!,
            undo =>
            {
                Assert.Null(undo.RawText);
                Assert.Equal("none", undo.Parser);
                Assert.Equal(ActionType.Undo, Assert.Single(undo.Actions).Type);
            },
            um =>
            {
                Assert.Equal("um", um.RawText);
                Assert.Equal("none", um.Parser);
                Assert.False(um.Understood);
            });

        var all = await _client.GetFromJsonAsync<List<CommandLogSummary>>("/api/commands/recent", KioskApiFactory.Json, Ct);
        var add = all!.Last();
        Assert.Equal(("add milk", "rules", true, true), (add.RawText, add.Parser, add.Understood, add.Undone));
    }

    private async Task<CommandResponse> SayAsync(string text)
    {
        var response = await _client.PostAsJsonAsync("/api/commands", new { text }, Ct);
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<CommandResponse>();
    }

    private async Task<CommandResponse> PostAsync(string path)
    {
        var response = await _client.PostAsync(path, null, Ct);
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<CommandResponse>();
    }

    private async Task<ListDetail> GetGroceryAsync() =>
        (await _client.GetFromJsonAsync<ListDetail>("/api/lists/grocery", KioskApiFactory.Json, Ct))!;
}
