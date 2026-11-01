using System.Diagnostics;
using System.Net.Http.Json;
using HomeKiosk.Api.Tests.Telegram;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using HomeKiosk.Infrastructure.Telegram;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace HomeKiosk.Api.Tests;

/// <summary>The Telegram bot end to end over a fake Bot API: allowlist, free text, slash commands, groups, dedupe.</summary>
public sealed class TelegramTests : IAsyncLifetime
{
    private const long Matt = 111;
    private const long FamilyGroup = -100500;
    private const long Stranger = 999;

    private readonly FakeTelegramGateway _telegram = new();
    private readonly KioskApiFactory _factory;
    private HttpClient _client = null!;

    public TelegramTests()
    {
        _factory = TelegramFactory(_telegram);
    }

    internal static KioskApiFactory TelegramFactory(FakeTelegramGateway telegram) => new()
    {
        Settings =
        {
            ["Telegram:BotToken"] = "123456:test-token",
            ["Telegram:AllowedChats:0:ChatId"] = Matt.ToString(),
            ["Telegram:AllowedChats:0:Name"] = "Matt",
            ["Telegram:AllowedChats:1:ChatId"] = FamilyGroup.ToString(),
            ["Telegram:AllowedChats:1:Name"] = "Family group",
        },
        TestServices = s => s.AddSingleton<ITelegramGateway>(telegram),
    };

    public async ValueTask InitializeAsync()
    {
        _client = _factory.CreateKioskClient();
        await _factory.WaitForHealthAsync("telegram", "connected", TimeSpan.FromSeconds(10), Ct);
    }

    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task An_allowed_chat_adds_an_item_the_kiosk_updates_and_the_bot_replies()
    {
        await using var hub = await _factory.ConnectHubAsync(Ct);
        var listChanged = Listen<ListDetail>(hub, "ListChanged");
        var processed = Listen<CommandResponse>(hub, "CommandProcessed");
        var sent = Stopwatch.StartNew();

        _telegram.Send(Matt, "add eggs");

        var list = await listChanged.WaitAsync(TimeSpan.FromSeconds(1), Ct); // spec M4: "within a second"
        var item = Assert.Single(list.Items);
        Assert.Equal(("Eggs", CommandSource.Telegram, "Matt"), (item.Text, item.Source, item.AddedBy));
        Assert.Equal((CommandSource.Telegram, "Matt"), ((await processed).Source, (await processed).AddedBy));
        Assert.Equal(new FakeTelegramGateway.SentMessage(Matt, "Added eggs to Grocery.", null), await _telegram.NextReplyAsync(Ct));
        Assert.True(sent.Elapsed < TimeSpan.FromSeconds(1), $"took {sent.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task A_chat_off_the_allowlist_is_told_its_id_and_nothing_happens()
    {
        _telegram.Send(Stranger, "add eggs", sender: "Mallory");

        Assert.Equal(
            new FakeTelegramGateway.SentMessage(Stranger, "This bot is private. Your chat ID is 999. Ask the admin to add it.", null),
            await _telegram.NextReplyAsync(Ct));
        Assert.Empty((await GroceryAsync()).Items);
        Assert.Empty((await _client.GetFromJsonAsync<List<CommandLogSummary>>("/api/commands/recent", KioskApiFactory.Json, Ct))!);
    }

    [Fact]
    public async Task Reading_a_list_is_formatted_as_escaped_HTML()
    {
        await _client.PostAsJsonAsync("/api/lists/grocery/items", new { text = "Salt <coarse> & pepper" }, Ct);
        await SayAsync("put two gallons of water on the list");

        Assert.Equal("<b>Grocery</b>\n• Salt &lt;coarse&gt; &amp; pepper\n• Water (two gallons)", await SayAsync("what's on the grocery list?"));
        Assert.Equal("<b>Grocery</b>\n• Salt &lt;coarse&gt; &amp; pepper\n• Water (two gallons)", await SayAsync("/list"));
        Assert.Equal("<b>To-do</b> is empty.", await SayAsync("/list to do"));
        Assert.Equal("I don't have a list called Camping. Say 'create a list called Camping' to add it.", await SayAsync("/list camping"));
    }

    [Fact]
    public async Task Slash_commands()
    {
        Assert.Equal("You have 2 lists: Grocery and To-do.", await SayAsync("/lists"));
        Assert.Equal("Added bread and eggs to Grocery.", await SayAsync("/add bread, eggs"));
        Assert.Equal("Checked off eggs.", await SayAsync("/done eggs"));
        Assert.Equal("Cleared 1 completed item from Grocery.", await SayAsync("/clear"));
        Assert.Equal("Undid the last change: Cleared 1 completed item from Grocery.", await SayAsync("/undo"));
        Assert.Equal("There are no completed items on To-do.", await SayAsync("/clear to-do"));
        Assert.Equal("What should I add? For example: /add milk, eggs", await SayAsync("/add"));
        Assert.Equal("What should I check off? For example: /done milk", await SayAsync("/done"));
        Assert.Equal("I don't know /order. Send /help to see what I understand.", await SayAsync("/order pizza"));
        Assert.StartsWith("<b>Home Kiosk</b>", await SayAsync("/help"));
        Assert.StartsWith("<b>Home Kiosk</b>", await SayAsync("/start"));

        var grocery = await GroceryAsync();
        Assert.Equal(["Bread", "Eggs"], grocery.Items.Select(i => i.Text));
        Assert.Equal([false, true], grocery.Items.Select(i => i.IsCompleted));
    }

    [Fact]
    public async Task Commands_are_published_to_Telegram_on_connect()
    {
        Assert.Equal(["list", "lists", "add", "done", "clear", "undo", "help"], _telegram.PublishedCommands!.Select(c => c.Command));
    }

    [Fact]
    public async Task In_a_group_the_sender_is_credited_and_chatter_is_ignored()
    {
        _telegram.Send(FamilyGroup, "see you at six!", isGroup: true, sender: "Jaime");
        var add = _telegram.Send(FamilyGroup, "we're out of coffee", isGroup: true, sender: "Jaime");

        // The chatter got no reply: the first reply is for the second message, quoting it.
        Assert.Equal(new FakeTelegramGateway.SentMessage(FamilyGroup, "Added coffee to Grocery.", add.Message!.MessageId), await _telegram.NextReplyAsync(Ct));
        Assert.Equal("Jaime", Assert.Single((await GroceryAsync()).Items).AddedBy);

        var logged = Assert.Single((await _client.GetFromJsonAsync<List<CommandLogSummary>>("/api/commands/recent", KioskApiFactory.Json, Ct))!);
        Assert.Equal("we're out of coffee", logged.RawText);

        // Slash commands always answer, and ones meant for another bot are left alone.
        _telegram.Send(FamilyGroup, "/list@SomeOtherBot", isGroup: true, sender: "Jaime");
        _telegram.Send(FamilyGroup, $"/list@{FakeTelegramGateway.BotUsername}", isGroup: true, sender: "Jaime");
        Assert.Equal("<b>Grocery</b>\n• Coffee", (await _telegram.NextReplyAsync(Ct)).Html);
    }

    [Fact]
    public async Task Unrecognized_text_in_a_private_chat_gets_the_hint()
    {
        Assert.Equal("I didn't catch that. Try 'add milk to the grocery list'.", await SayAsync("what's the weather"));
    }

    [Fact]
    public async Task A_redelivered_update_is_answered_again_but_applied_once()
    {
        var first = _telegram.Send(Matt, "add milk", updateId: 42);
        Assert.Equal("Added milk to Grocery.", (await _telegram.NextReplyAsync(Ct)).Html);

        _telegram.Deliver(first); // e.g. we stopped before the next poll acknowledged it

        Assert.Equal("Added milk to Grocery.", (await _telegram.NextReplyAsync(Ct)).Html);
        Assert.Single((await GroceryAsync()).Items);
        Assert.Single((await _client.GetFromJsonAsync<List<CommandLogSummary>>("/api/commands/recent", KioskApiFactory.Json, Ct))!);
    }

    [Fact]
    public async Task Voice_notes_get_a_text_only_reply_for_now()
    {
        _telegram.Send(Matt, text: null);

        Assert.Equal(TelegramUpdateHandler.VoiceNotYet, (await _telegram.NextReplyAsync(Ct)).Html);
    }

    [Fact]
    public async Task A_failing_update_does_not_stop_the_bot()
    {
        _telegram.SendFailures.Enqueue(new HttpRequestException("network down"));
        _telegram.Send(Matt, "add milk"); // applied, but the reply fails

        Assert.Equal("Added bread to Grocery.", await SayAsync("add bread"));
    }

    private async Task<string> SayAsync(string text)
    {
        _telegram.Send(Matt, text);
        var reply = await _telegram.NextReplyAsync(Ct);
        Assert.Equal(Matt, reply.ChatId);
        return reply.Html;
    }

    private async Task<ListDetail> GroceryAsync() =>
        (await _client.GetFromJsonAsync<ListDetail>("/api/lists/grocery", KioskApiFactory.Json, Ct))!;

    private static Task<T> Listen<T>(HubConnection hub, string eventName)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        hub.On<T>(eventName, payload => tcs.TrySetResult(payload));
        return tcs.Task;
    }
}

/// <summary>Health and lifecycle of the polling loop: disabled, connected, backing off, bad token.</summary>
public sealed class TelegramLifecycleTests
{
    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Network_errors_report_error_then_recover()
    {
        var telegram = new FakeTelegramGateway();
        telegram.ConnectFailures.Enqueue(new HttpRequestException("no route to host"));
        await using var factory = TelegramTests.TelegramFactory(telegram);

        await factory.WaitForHealthAsync("telegram", "error", TimeSpan.FromSeconds(10), Ct);
        await factory.WaitForHealthAsync("telegram", "connected", TimeSpan.FromSeconds(10), Ct); // after the 1 s backoff

        telegram.Send(111, "add milk");
        Assert.Equal("Added milk to Grocery.", (await telegram.NextReplyAsync(Ct)).Html);
    }

    [Fact]
    public async Task A_rejected_token_turns_the_bot_off()
    {
        var telegram = new FakeTelegramGateway();
        telegram.ConnectFailures.Enqueue(new TelegramApiException(401, "Unauthorized"));
        await using var factory = TelegramTests.TelegramFactory(telegram);

        await factory.WaitForHealthAsync("telegram", "error", TimeSpan.FromSeconds(10), Ct);
        await Task.Delay(1500, Ct); // longer than the first backoff: no retry happens

        Assert.Equal(1, telegram.ConnectCalls);
    }

    [Fact]
    public async Task Without_a_token_the_bot_is_disabled_and_never_connects()
    {
        var telegram = new FakeTelegramGateway();
        await using var factory = new KioskApiFactory { TestServices = s => s.AddSingleton<ITelegramGateway>(telegram) };

        await factory.WaitForHealthAsync("telegram", "disabled", TimeSpan.FromSeconds(10), Ct);

        Assert.Equal(0, telegram.ConnectCalls);
    }
}
