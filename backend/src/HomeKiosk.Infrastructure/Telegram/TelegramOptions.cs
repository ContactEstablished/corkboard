namespace HomeKiosk.Infrastructure.Telegram;

public sealed class TelegramOptions
{
    public const string Section = "Telegram";

    public const string Polling = "Polling";

    public bool Enabled { get; set; } = true;

    /// <summary>Only <see cref="Polling"/> for now (no inbound port or public URL needed).</summary>
    public string Mode { get; set; } = Polling;

    /// <summary>From @BotFather. Never logged. Empty turns the bot off. Env: <c>Telegram__BotToken</c>.</summary>
    public string BotToken { get; set; } = "";

    /// <summary>The only chats the bot acts for. Others are told their chat ID so the admin can add them.</summary>
    public List<AllowedChat> AllowedChats { get; set; } = [];
}

/// <param name="Name">Becomes <c>AddedBy</c> in a private chat. In a group, the sender's first name is used instead.</param>
public sealed record AllowedChat(long ChatId, string Name);
