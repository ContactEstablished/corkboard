using HomeKiosk.Core.Domain;

namespace HomeKiosk.Infrastructure.Persistence;

public static class SeedData
{
    /// <summary>Starter lists for an empty database: Grocery (default) and To-do.</summary>
    public static IReadOnlyList<KioskList> StarterLists(DateTimeOffset now) =>
    [
        new()
        {
            Id = Guid.CreateVersion7(now),
            Name = "Grocery",
            Slug = "grocery",
            Aliases = ["groceries", "food", "store", "shopping"],
            IsDefault = true,
            CreatedAt = now,
        },
        new()
        {
            Id = Guid.CreateVersion7(now.AddMilliseconds(1)),
            Name = "To-do",
            Slug = "to-do",
            Aliases = ["todo", "to do", "chores"],
            CreatedAt = now.AddMilliseconds(1),
        },
    ];
}
