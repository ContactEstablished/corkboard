namespace HomeKiosk.Core.Domain;

public sealed class CommandLog
{
    public Guid Id { get; set; }
    public CommandSource Source { get; set; }
    public string? RawText { get; set; } // typed text, or transcript for voice
    public int? AudioDurationMs { get; set; }
    public string Parser { get; set; } = ""; // "rules" | "llm" | "none"
    public string ActionsJson { get; set; } = "[]"; // serialized parsed actions + per-action status
    public string Reply { get; set; } = "";
    public bool Understood { get; set; }
    public string? Error { get; set; }
    public string? UserName { get; set; }
    public long? TelegramChatId { get; set; }
    public long? TelegramUpdateId { get; set; } // unique index, dedupes redelivered updates
    public int SttMs { get; set; }
    public int ParseMs { get; set; }
    public int TotalMs { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public bool Undone { get; set; }
}
