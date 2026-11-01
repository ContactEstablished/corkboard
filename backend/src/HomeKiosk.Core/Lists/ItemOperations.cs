using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Lists;

public enum AddOutcome
{
    Added,
    Reopened,
    AlreadyOpen,
}

/// <summary>Item rules shared by direct edits (<see cref="ListService"/>) and spoken/typed commands.</summary>
public static class ItemOperations
{
    /// <summary>
    /// Dedupe on add: an open item with the same normalized text is returned unchanged; a completed one
    /// is reopened; otherwise a new item is added to <paramref name="list"/> and the repository.
    /// </summary>
    public static (ListItem Item, AddOutcome Outcome, DateTimeOffset? PreviousCompletedAt) AddOrReopen(
        IKioskRepository repository,
        KioskList list,
        string text,
        string normalizedText,
        string? quantity,
        string? addedBy,
        CommandSource source,
        DateTimeOffset now,
        Guid? commandId = null)
    {
        var existing = list.Items
            .Where(i => i.DeletedAt is null && i.NormalizedText == normalizedText)
            .OrderBy(i => i.IsCompleted)
            .ThenByDescending(i => i.CompletedAt)
            .FirstOrDefault();

        if (existing is { IsCompleted: false })
        {
            return (existing, AddOutcome.AlreadyOpen, null);
        }

        if (existing is not null)
        {
            var previous = existing.CompletedAt;
            existing.IsCompleted = false;
            existing.CompletedAt = null;
            existing.Quantity = quantity ?? existing.Quantity;
            existing.LastCommandId = commandId ?? existing.LastCommandId;
            return (existing, AddOutcome.Reopened, previous);
        }

        // Items added by one command share `now`, and v7 IDs within a millisecond sort randomly. A tick past the
        // newest item keeps "add milk, eggs and bread" in the order it was said.
        var createdAt = list.Items.Count == 0 ? now : Max(now, list.Items.Max(i => i.CreatedAt).AddTicks(1));
        var item = new ListItem
        {
            Id = Guid.CreateVersion7(createdAt),
            ListId = list.Id,
            Text = text,
            NormalizedText = normalizedText,
            Quantity = quantity,
            AddedBy = addedBy,
            Source = source,
            CreatedAt = createdAt,
            LastCommandId = commandId,
        };
        repository.Add(item);
        // The repository may already have attached it to the tracked list (EF relationship fixup).
        if (!list.Items.Contains(item))
        {
            list.Items.Add(item);
        }

        return (item, AddOutcome.Added, null);
    }

    private static DateTimeOffset Max(DateTimeOffset a, DateTimeOffset b) => a > b ? a : b;
}
