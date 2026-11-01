using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace HomeKiosk.Infrastructure.Persistence;

public sealed class KioskRepository(KioskDbContext db) : IKioskRepository
{
    public async Task<IReadOnlyList<KioskList>> GetListsAsync(bool includeItems, CancellationToken ct) =>
        await Lists(includeItems).ToListAsync(ct);

    public Task<KioskList?> FindListBySlugAsync(string slug, bool includeItems, CancellationToken ct) =>
        Lists(includeItems).FirstOrDefaultAsync(l => l.Slug == slug, ct);

    public Task<KioskList?> FindListByIdAsync(Guid id, bool includeItems, CancellationToken ct) =>
        Lists(includeItems).FirstOrDefaultAsync(l => l.Id == id, ct);

    public Task<ListItem?> FindItemAsync(Guid id, CancellationToken ct) =>
        db.Items.FirstOrDefaultAsync(i => i.Id == id, ct);

    public async Task<IReadOnlyList<ListItem>> GetItemsIncludingDeletedAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        await db.Items.IgnoreQueryFilters().Where(i => ids.Contains(i.Id)).ToListAsync(ct);

    public Task<CommandLog?> FindCommandByTelegramUpdateIdAsync(long updateId, CancellationToken ct) =>
        db.CommandLogs.FirstOrDefaultAsync(c => c.TelegramUpdateId == updateId, ct);

    public async Task<IReadOnlyList<CommandLog>> GetRecentCommandsAsync(int take, CancellationToken ct)
    {
        // v7 IDs sort by creation time. SQLite can't ORDER BY a DateTimeOffset, so the final
        // (sub-millisecond) ordering happens in memory.
        var logs = await db.CommandLogs.OrderByDescending(c => c.Id).Take(take).ToListAsync(ct);
        return [.. logs.OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)];
    }

    public void Add(KioskList list) => db.Lists.Add(list);

    public void Add(ListItem item) => db.Items.Add(item);

    public void Add(CommandLog log) => db.CommandLogs.Add(log);

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);

    public void DiscardChanges() => db.ChangeTracker.Clear();

    private IQueryable<KioskList> Lists(bool includeItems) => includeItems ? db.Lists.Include(l => l.Items) : db.Lists;
}
