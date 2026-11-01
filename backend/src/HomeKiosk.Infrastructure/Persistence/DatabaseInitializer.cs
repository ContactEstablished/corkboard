using HomeKiosk.Core.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace HomeKiosk.Infrastructure.Persistence;

/// <summary>
/// Migrates, switches SQLite to WAL and seeds the starter lists. Hosted services start before the
/// server listens, so no request sees an unmigrated database. Single instance, so migrating here is safe.
/// </summary>
public sealed class DatabaseInitializer(IServiceScopeFactory scopes, IClock clock, ILogger<DatabaseInitializer> logger)
    : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KioskDbContext>();

        await db.Database.MigrateAsync(ct);
        // journal_mode is persisted in the database file, so setting it once per start is enough.
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);

        if (!await db.Lists.IgnoreQueryFilters().AnyAsync(ct))
        {
            db.Lists.AddRange(SeedData.StarterLists(clock.UtcNow));
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Seeded starter lists");
        }
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
