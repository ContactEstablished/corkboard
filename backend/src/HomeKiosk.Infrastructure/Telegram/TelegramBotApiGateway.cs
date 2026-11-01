using Microsoft.Extensions.Options;
using Telegram.BotAPI;
using Telegram.BotAPI.AvailableMethods;
using Telegram.BotAPI.AvailableTypes;
using Telegram.BotAPI.GettingUpdates;

namespace HomeKiosk.Infrastructure.Telegram;

/// <summary><see cref="ITelegramGateway"/> over the Telegram.BotAPI package.</summary>
public sealed class TelegramBotApiGateway(IOptions<TelegramOptions> options) : ITelegramGateway, IDisposable
{
    private static readonly string[] AllowedUpdates = ["message", "callback_query"];

    // Our own client, not IHttpClientFactory: its request logging would write the token (it's in the URL).
    // The timeout must outlast the 30 s long poll.
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(60) };
    private TelegramBotClient? _client;

    private TelegramBotClient Client => _client ??= new TelegramBotClient(
        new TelegramBotClientOptions(options.Value.BotToken, _http) { IgnoreBotExceptions = false }); // we map the errors

    public Task<string> ConnectAsync(IReadOnlyList<TelegramBotCommand> commands, CancellationToken ct) => CallAsync(async () =>
    {
        var me = await Client.GetMeAsync(ct);
        await Client.DeleteWebhookAsync(cancellationToken: ct);
        await Client.SetMyCommandsAsync(commands.Select(c => new BotCommand(c.Command, c.Description)), cancellationToken: ct);
        return me.Username ?? "";
    });

    public Task<IReadOnlyList<TelegramUpdate>> GetUpdatesAsync(long offset, int timeoutSeconds, CancellationToken ct) => CallAsync(async () =>
    {
        var updates = await Client.GetUpdatesAsync(
            offset: checked((int)offset),
            timeout: timeoutSeconds,
            allowedUpdates: AllowedUpdates,
            cancellationToken: ct);
        return (IReadOnlyList<TelegramUpdate>)[.. updates.Select(Map)];
    });

    public Task SendMessageAsync(long chatId, string html, int? replyToMessageId, CancellationToken ct) => CallAsync(() =>
        Client.SendMessageAsync(
            chatId,
            html,
            parseMode: "HTML",
            replyParameters: replyToMessageId is { } id ? new ReplyParameters { MessageId = id, AllowSendingWithoutReply = true } : null,
            cancellationToken: ct));

    public void Dispose() => _http.Dispose();

    private static TelegramUpdate Map(Update update) =>
        new(
            update.UpdateId,
            update.Message is { } m
                ? new TelegramMessage(
                    m.MessageId,
                    m.Chat.Id,
                    m.Chat.Type is ChatTypes.Group or ChatTypes.Supergroup,
                    m.From?.FirstName,
                    m.Text,
                    HasVoice: m.Voice is not null)
                : null);

    private static async Task<T> CallAsync<T>(Func<Task<T>> call)
    {
        try
        {
            return await call();
        }
        catch (BotRequestException ex)
        {
            throw new TelegramApiException(ex.ErrorCode, ex.Description, ex);
        }
    }
}
