namespace HomeKiosk.Core.Domain;

public sealed class KioskList
{
    public Guid Id { get; set; } // v7
    public string Name { get; set; } = ""; // "Grocery"
    public string Slug { get; set; } = ""; // "grocery" (unique among live lists)
    public List<string> Aliases { get; set; } = []; // ["groceries", "food", "store"], stored as JSON
    public bool IsDefault { get; set; } // exactly one live list is default
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; } // soft delete
    public List<ListItem> Items { get; set; } = [];
}
