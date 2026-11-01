using System.Collections.Concurrent;
using System.Threading.Channels;
using HomeKiosk.Infrastructure.Telegram;

namespace HomeKiosk.Api.Tests.Telegram;

/// <summary>Stands in for the Bot API: tests push updates in and read the bot's replies out.</summary>
public sealed class FakeTelegramGateway : ITelegramGateway
{
    public const string BotUsername = "KioskTestBot";

    private readonly Channel<TelegramUpdate> _updates = Channel.CreateUnbounded<TelegramUpdate>();
    private readonly Channel<SentMessage> _sent = Channel.CreateUnbounded<SentMessage>();
    private long _nextUpdateId = 1000;
    private int _nextMessageId = 1;

    public sealed record SentMessage(long ChatId, string Html, int? ReplyTo);

    /// <summary>Thrown, one per call, before <see cref="ConnectAsync"/> / <see cref="GetUpdatesAsync"/> work normally.</summary>
    public ConcurrentQueue<Exception> ConnectFailures { get; } = new();

    public ConcurrentQueue<Exception> PollFailures { get; } = new();

    public ConcurrentQueue<Exception> SendFailures { get; } = new();

    public IReadOnlyList<TelegramBotCommand>? PublishedCommands { get; private set; }

    public int ConnectCalls;

    /// <summary>Queues a text message (or a voice note when <paramref name="text"/> is null) and returns its update.</summary>
    public TelegramUpdate Send(long chatId, string? text, bool isGroup = false, string? sender = "Matt", long? updateId = null)
    {
        var update = new TelegramUpdate(
            updateId ?? Interlocked.Increment(ref _nextUpdateId),
            new TelegramMessage(Interlocked.Increment(ref _nextMessageId), chatId, isGroup, sender, text, HasVoice: text is null));
        Deliver(update);
        return update;
    }

    public void Deliver(TelegramUpdate update) => _updates.Writer.TryWrite(update);

    /// <summary>The bot's next reply, in order.</summary>
    public async Task<SentMessage> NextReplyAsync(CancellationToken ct) =>
        await _sent.Reader.ReadAsync(ct).AsTask().WaitAsync(TimeSpan.FromSeconds(10), ct);

    public Task<string> ConnectAsync(IReadOnlyList<TelegramBotCommand> commands, CancellationToken ct)
    {
        Interlocked.Increment(ref ConnectCalls);
        if (ConnectFailures.TryDequeue(out var failure))
        {
            throw failure;
        }

        PublishedCommands = commands;
        return Task.FromResult(BotUsername);
    }

    public async Task<IReadOnlyList<TelegramUpdate>> GetUpdatesAsync(long offset, int timeoutSeconds, CancellationToken ct)
    {
        if (PollFailures.TryDequeue(out var failure))
        {
            throw failure;
        }

        // Like a long poll: wait for at least one update, then return everything queued.
        await _updates.Reader.WaitToReadAsync(ct);
        var batch = new List<TelegramUpdate>();
        while (_updates.Reader.TryRead(out var update))
        {
            batch.Add(update);
        }

        return batch;
    }

    public Task SendMessageAsync(long chatId, string html, int? replyToMessageId, CancellationToken ct)
    {
        if (SendFailures.TryDequeue(out var failure))
        {
            throw failure;
        }

        _sent.Writer.TryWrite(new SentMessage(chatId, html, replyToMessageId));
        return Task.CompletedTask;
    }
}
