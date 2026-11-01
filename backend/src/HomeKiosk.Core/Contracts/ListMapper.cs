using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Contracts;

public static class ListMapper
{
    public static ListSummary ToSummary(KioskList list) =>
        new(
            list.Id,
            list.Slug,
            list.Name,
            list.IsDefault,
            list.Items.Count(i => i.DeletedAt is null && !i.IsCompleted),
            list.Items.Count(i => i.DeletedAt is null && i.IsCompleted));

    public static ListDetail ToDetail(KioskList list, bool includeCompleted = true)
    {
        var live = list.Items.Where(i => i.DeletedAt is null).ToList();
        var open = live.Where(i => !i.IsCompleted).OrderBy(i => i.CreatedAt).ThenBy(i => i.Id);
        var completed = includeCompleted
            ? live.Where(i => i.IsCompleted).OrderByDescending(i => i.CompletedAt).ThenByDescending(i => i.Id)
            : Enumerable.Empty<ListItem>();

        return new ListDetail(list.Id, list.Slug, list.Name, list.IsDefault, [.. open.Concat(completed).Select(ToDto)]);
    }

    public static ItemDto ToDto(ListItem item) =>
        new(
            item.Id,
            item.ListId,
            item.Text,
            item.Quantity,
            item.IsCompleted,
            item.CompletedAt,
            item.AddedBy,
            item.Source,
            item.CreatedAt);

    /// <summary>Default list first, then in creation order.</summary>
    public static IReadOnlyList<ListSummary> ToSummaries(IEnumerable<KioskList> lists) =>
        [.. lists.OrderByDescending(l => l.IsDefault).ThenBy(l => l.CreatedAt).Select(ToSummary)];
}
