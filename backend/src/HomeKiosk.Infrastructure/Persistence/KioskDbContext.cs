using HomeKiosk.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace HomeKiosk.Infrastructure.Persistence;

public sealed class KioskDbContext(DbContextOptions<KioskDbContext> options) : DbContext(options)
{
    public DbSet<KioskList> Lists => Set<KioskList>();

    public DbSet<ListItem> Items => Set<ListItem>();

    public DbSet<CommandLog> CommandLogs => Set<CommandLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<KioskList>(list =>
        {
            // IDs are v7 GUIDs assigned in code, so EF must not read a set key as "already saved".
            list.Property(l => l.Id).ValueGeneratedNever();
            list.Property(l => l.Name).HasMaxLength(50);
            list.Property(l => l.Slug).HasMaxLength(60);
            // Unique among live lists only, so a deleted list's name can be reused.
            list.HasIndex(l => l.Slug).IsUnique().HasFilter("\"DeletedAt\" IS NULL");
            list.HasMany(l => l.Items).WithOne().HasForeignKey(i => i.ListId);
            list.HasQueryFilter(l => l.DeletedAt == null);
        });

        modelBuilder.Entity<ListItem>(item =>
        {
            item.Property(i => i.Id).ValueGeneratedNever();
            item.Property(i => i.Text).HasMaxLength(100);
            item.Property(i => i.NormalizedText).HasMaxLength(100);
            item.Property(i => i.Quantity).HasMaxLength(50);
            item.Property(i => i.Source).HasConversion<string>().HasMaxLength(20);
            item.HasIndex(i => new { i.ListId, i.IsCompleted });
            item.HasIndex(i => new { i.ListId, i.NormalizedText });
            item.HasQueryFilter(i => i.DeletedAt == null);
        });

        modelBuilder.Entity<CommandLog>(log =>
        {
            log.Property(c => c.Id).ValueGeneratedNever();
            log.Property(c => c.Source).HasConversion<string>().HasMaxLength(20);
            log.Property(c => c.Parser).HasMaxLength(10);
            log.HasIndex(c => c.TelegramUpdateId).IsUnique().HasFilter("\"TelegramUpdateId\" IS NOT NULL");
        });
    }
}
