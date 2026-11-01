using System.Net.Http.Json;
using HomeKiosk.Core.Contracts;
using Microsoft.AspNetCore.SignalR.Client;

namespace HomeKiosk.Api.Tests;

/// <summary>M1 acceptance: a write over REST reaches a second connected client over SignalR.</summary>
public sealed class LiveUpdateTests : IAsyncLifetime
{
    private static readonly TimeSpan EventTimeout = TimeSpan.FromSeconds(10);

    private readonly KioskApiFactory _factory = new();
    private HubConnection _hub = null!;

    public async ValueTask InitializeAsync() => _hub = await _factory.ConnectHubAsync(TestContext.Current.CancellationToken);

    public async ValueTask DisposeAsync()
    {
        await _hub.DisposeAsync();
        await _factory.DisposeAsync();
    }

    [Fact]
    public async Task Adding_an_item_broadcasts_ListChanged()
    {
        var received = Listen<ListDetail>("ListChanged");

        await _factory.CreateKioskClient()
            .PostAsJsonAsync("/api/lists/grocery/items", new { text = "milk" }, TestContext.Current.CancellationToken);

        var list = await received.WaitAsync(EventTimeout, TestContext.Current.CancellationToken);
        Assert.Equal("grocery", list.Slug);
        Assert.Equal("Milk", Assert.Single(list.Items).Text);
    }

    [Fact]
    public async Task Creating_a_list_broadcasts_ListsChanged()
    {
        var received = Listen<List<ListSummary>>("ListsChanged");

        await _factory.CreateKioskClient()
            .PostAsJsonAsync("/api/lists", new { name = "Hardware" }, TestContext.Current.CancellationToken);

        var lists = await received.WaitAsync(EventTimeout, TestContext.Current.CancellationToken);
        Assert.Contains(lists, l => l.Slug == "hardware");
    }

    [Fact]
    public async Task A_command_broadcasts_ListChanged_and_CommandProcessed()
    {
        var listChanged = Listen<ListDetail>("ListChanged");
        var processed = Listen<CommandResponse>("CommandProcessed");

        await _factory.CreateKioskClient()
            .PostAsJsonAsync("/api/commands", new { text = "add milk to the grocery list" }, TestContext.Current.CancellationToken);

        var list = await listChanged.WaitAsync(EventTimeout, TestContext.Current.CancellationToken);
        var response = await processed.WaitAsync(EventTimeout, TestContext.Current.CancellationToken);
        Assert.Equal("Milk", Assert.Single(list.Items).Text);
        Assert.Equal("Added milk to Grocery.", response.Reply);
    }

    [Fact]
    public async Task Unrecognized_commands_still_broadcast_CommandProcessed()
    {
        var processed = Listen<CommandResponse>("CommandProcessed");

        await _factory.CreateKioskClient()
            .PostAsJsonAsync("/api/commands", new { text = "what's the weather" }, TestContext.Current.CancellationToken);

        Assert.False((await processed.WaitAsync(EventTimeout, TestContext.Current.CancellationToken)).Understood);
    }

    private Task<T> Listen<T>(string eventName)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _hub.On<T>(eventName, payload => tcs.TrySetResult(payload));
        return tcs.Task;
    }
}
