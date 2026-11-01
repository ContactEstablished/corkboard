namespace HomeKiosk.Core.Domain;

public sealed class ListItem
{
    public Guid Id { get; set; }
    public Guid ListId { get; set; }
    public string Text { get; set; } = ""; // display text, e.g. "Milk"
    public string NormalizedText { get; set; } = ""; // "milk" (dedupe + matching)
    public string? Quantity { get; set; } // free text: "2 gallons"
    public bool IsCompleted { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? AddedBy { get; set; } // "Kiosk", or Telegram allowlist name
    public CommandSource Source { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; } // soft delete (enables undo)
    public Guid? LastCommandId { get; set; } // the command that last changed this item
}
