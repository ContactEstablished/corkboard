using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace HomeKiosk.Infrastructure.Persistence;

/// <summary>Used only by <c>dotnet ef</c>, so adding a migration doesn't boot the API.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<KioskDbContext>
{
    public KioskDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<KioskDbContext>().UseSqlite("Data Source=design-time.db").Options);
}
