using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Abstractions;

/// <summary>
/// Unit of work over lists, items and the command log. Returned entities are tracked: mutate them, then
/// call <see cref="SaveChangesAsync"/> to commit every change in one transaction.
/// Soft-deleted rows are never returned unless the method says so.
/// </summary>
public interface IKioskRepository
{
    Task<IReadOnlyList<KioskList>> GetListsAsync(bool includeItems, CancellationToken ct);

    Task<KioskList?> FindListBySlugAsync(string slug, bool includeItems, CancellationToken ct);

    Task<KioskList?> FindListByIdAsync(Guid id, bool includeItems, CancellationToken ct);

    Task<ListItem?> FindItemAsync(Guid id, CancellationToken ct);

    /// <summary>Items by ID including soft-deleted ones, for undo.</summary>
    Task<IReadOnlyList<ListItem>> GetItemsIncludingDeletedAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct);

    Task<CommandLog?> FindCommandByTelegramUpdateIdAsync(long updateId, CancellationToken ct);

    /// <summary>Most recent commands first.</summary>
    Task<IReadOnlyList<CommandLog>> GetRecentCommandsAsync(int take, CancellationToken ct);

    void Add(KioskList list);

    void Add(ListItem item);

    void Add(CommandLog log);

    Task SaveChangesAsync(CancellationToken ct);

    /// <summary>Forgets every pending change, e.g. after a failed command, so only its log entry is saved.</summary>
    void DiscardChanges();
}
