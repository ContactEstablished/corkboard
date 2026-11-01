namespace HomeKiosk.Infrastructure.Telegram;

/// <summary>An incoming update, reduced to what the bot uses.</summary>
/// <param name="Message">Null for updates the bot ignores (edits, button presses until M5).</param>
public sealed record TelegramUpdate(long UpdateId, TelegramMessage? Message);

/// <param name="IsGroup">A group or supergroup, as opposed to a private chat.</param>
public sealed record TelegramMessage(int MessageId, long ChatId, bool IsGroup, string? SenderFirstName, string? Text, bool HasVoice = false);

public sealed record TelegramBotCommand(string Command, string Description);

/// <summary>A Bot API error response, e.g. 401 for a bad token or 409 when another instance is polling.</summary>
public sealed class TelegramApiException(int errorCode, string description, Exception? inner = null)
    : Exception($"Telegram API error {errorCode}: {description}", inner)
{
    public int ErrorCode { get; } = errorCode;
}

/// <summary>Every Bot API call the bot makes, so the handlers can be tested against a fake.</summary>
public interface ITelegramGateway
{
    /// <summary>Checks the token, drops any webhook (polling and webhooks are exclusive) and publishes the slash commands.</summary>
    /// <returns>The bot's username, for recognizing <c>/list@ThisBot</c> in groups.</returns>
    Task<string> ConnectAsync(IReadOnlyList<TelegramBotCommand> commands, CancellationToken ct);

    /// <summary>Long-polls for updates with an ID of at least <paramref name="offset"/>, acknowledging the earlier ones.</summary>
    Task<IReadOnlyList<TelegramUpdate>> GetUpdatesAsync(long offset, int timeoutSeconds, CancellationToken ct);

    /// <param name="html">Telegram HTML (<c>parse_mode = HTML</c>), already escaped.</param>
    /// <param name="replyToMessageId">Quote this message (used in groups, where several people talk).</param>
    Task SendMessageAsync(long chatId, string html, int? replyToMessageId, CancellationToken ct);
}
