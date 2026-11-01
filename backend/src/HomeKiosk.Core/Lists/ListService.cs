using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using HomeKiosk.Core.Matching;

namespace HomeKiosk.Core.Lists;

/// <summary>
/// Direct list and item edits (kiosk taps, REST). Every write commits, then publishes the new
/// state through <see cref="IListNotifier"/>.
/// </summary>
public sealed class ListService(IKioskRepository repository, IListNotifier notifier, IClock clock)
{
    public const int MaxListNameLength = 50;
    public const int MaxAliases = 10;
    public const int MaxItemTextLength = 100;
    public const int MaxQuantityLength = 50;

    public async Task<IReadOnlyList<ListSummary>> GetListsAsync(CancellationToken ct) =>
        ListMapper.ToSummaries(await repository.GetListsAsync(includeItems: true, ct));

    public async Task<ListDetail> GetListAsync(string slug, bool includeCompleted, CancellationToken ct)
    {
        var list = await RequireListAsync(slug, ct);
        return ListMapper.ToDetail(list, includeCompleted);
    }

    public async Task<ListSummary> CreateListAsync(CreateListRequest request, CancellationToken ct)
    {
        var name = CleanListName(request.Name);
        var slug = SlugGenerator.FromName(name);
        if (slug.Length == 0)
        {
            throw KioskException.Invalid("name", "The list name needs at least one letter or digit.");
        }

        var aliases = CleanAliases(request.Aliases);
        var lists = await repository.GetListsAsync(includeItems: false, ct);
        EnsureNamesAreFree(lists, except: null, [name, slug, .. aliases]);

        var list = new KioskList
        {
            Id = Guid.CreateVersion7(clock.UtcNow),
            Name = name,
            Slug = slug,
            Aliases = aliases,
            IsDefault = lists.Count == 0,
            CreatedAt = clock.UtcNow,
        };
        repository.Add(list);
        await repository.SaveChangesAsync(ct);

        await PublishListsAsync(ct);
        return ListMapper.ToSummary(list);
    }

    /// <summary>Renames keep the slug, so URLs and open views stay valid.</summary>
    public async Task<ListSummary> UpdateListAsync(string slug, UpdateListRequest request, CancellationToken ct)
    {
        var lists = await repository.GetListsAsync(includeItems: true, ct);
        var list = lists.FirstOrDefault(l => l.Slug == slug.ToLowerInvariant()) ?? throw KioskException.ListNotFound(slug);

        if (request.Name is not null)
        {
            var name = CleanListName(request.Name);
            EnsureNamesAreFree(lists, except: list, [name]);
            list.Name = name;
        }

        if (request.Aliases is not null)
        {
            var aliases = CleanAliases(request.Aliases);
            EnsureNamesAreFree(lists, except: list, aliases);
            list.Aliases = aliases;
        }

        if (request.IsDefault == true)
        {
            foreach (var other in lists)
            {
                other.IsDefault = other == list;
            }
        }
        else if (request.IsDefault == false && list.IsDefault)
        {
            throw KioskException.Invalid("isDefault", "Make another list the default instead.");
        }

        await repository.SaveChangesAsync(ct);

        await PublishListsAsync(ct);
        await notifier.ListChangedAsync(ListMapper.ToDetail(list), ct);
        return ListMapper.ToSummary(list);
    }

    public async Task DeleteListAsync(string slug, CancellationToken ct)
    {
        var list = await RequireListAsync(slug, ct);
        if (list.IsDefault)
        {
            throw KioskException.Conflict("The default list can't be deleted. Make another list the default first.");
        }

        list.DeletedAt = clock.UtcNow;
        await repository.SaveChangesAsync(ct);

        await PublishListsAsync(ct);
    }

    /// <summary>
    /// Adds an item, or returns the existing one when an open item has the same normalized text.
    /// A matching completed item is reopened instead of duplicated.
    /// </summary>
    public async Task<(ItemDto Item, bool Created)> AddItemAsync(
        string slug,
        AddItemRequest request,
        string addedBy,
        CommandSource source,
        CancellationToken ct)
    {
        var list = await RequireListAsync(slug, ct);
        var (text, normalized) = CleanItemText(request.Text);
        var quantity = CleanQuantity(request.Quantity);

        var (item, outcome, _) = ItemOperations.AddOrReopen(
            repository, list, text, normalized, quantity, addedBy, source, clock.UtcNow);
        if (outcome == AddOutcome.AlreadyOpen)
        {
            return (ListMapper.ToDto(item), false);
        }

        await repository.SaveChangesAsync(ct);

        await notifier.ListChangedAsync(ListMapper.ToDetail(list), ct);
        return (ListMapper.ToDto(item), outcome == AddOutcome.Added);
    }

    public async Task<ItemDto> UpdateItemAsync(Guid id, UpdateItemRequest request, CancellationToken ct)
    {
        var (list, item) = await RequireItemAsync(id, ct);

        if (request.Text is not null)
        {
            (item.Text, item.NormalizedText) = CleanItemText(request.Text);
        }

        if (request.Quantity is not null)
        {
            item.Quantity = CleanQuantity(request.Quantity);
        }

        if (request.IsCompleted is { } completed && completed != item.IsCompleted)
        {
            item.IsCompleted = completed;
            item.CompletedAt = completed ? clock.UtcNow : null;
        }

        await repository.SaveChangesAsync(ct);

        await notifier.ListChangedAsync(ListMapper.ToDetail(list), ct);
        return ListMapper.ToDto(item);
    }

    public async Task DeleteItemAsync(Guid id, CancellationToken ct)
    {
        var (list, item) = await RequireItemAsync(id, ct);
        item.DeletedAt = clock.UtcNow;
        await repository.SaveChangesAsync(ct);

        await notifier.ListChangedAsync(ListMapper.ToDetail(list), ct);
    }

    public async Task<ListDetail> ClearListAsync(string slug, bool completedOnly, CancellationToken ct)
    {
        var list = await RequireListAsync(slug, ct);
        var now = clock.UtcNow;
        foreach (var item in list.Items.Where(i => i.DeletedAt is null && (i.IsCompleted || !completedOnly)))
        {
            item.DeletedAt = now;
        }

        await repository.SaveChangesAsync(ct);

        var detail = ListMapper.ToDetail(list);
        await notifier.ListChangedAsync(detail, ct);
        return detail;
    }

    private async Task<KioskList> RequireListAsync(string slug, CancellationToken ct) =>
        await repository.FindListBySlugAsync(slug.ToLowerInvariant(), includeItems: true, ct)
            ?? throw KioskException.ListNotFound(slug);

    private async Task<(KioskList List, ListItem Item)> RequireItemAsync(Guid id, CancellationToken ct)
    {
        var item = await repository.FindItemAsync(id, ct) ?? throw KioskException.ItemNotFound(id);
        var list = await repository.FindListByIdAsync(item.ListId, includeItems: true, ct)
            ?? throw KioskException.ItemNotFound(id); // the item's list was deleted
        return (list, item);
    }

    private async Task PublishListsAsync(CancellationToken ct) =>
        await notifier.ListsChangedAsync(await GetListsAsync(ct), ct);

    private static string CleanListName(string? name)
    {
        var cleaned = TextNormalizer.ToDisplay(name);
        if (cleaned.Length == 0)
        {
            throw KioskException.Invalid("name", "The list name is required.");
        }

        if (cleaned.Length > MaxListNameLength)
        {
            throw KioskException.Invalid("name", $"The list name can be at most {MaxListNameLength} characters.");
        }

        return cleaned;
    }

    private static List<string> CleanAliases(IReadOnlyList<string>? aliases)
    {
        var cleaned = (aliases ?? []).Select(TextNormalizer.NormalizeName).Where(a => a.Length > 0).Distinct().ToList();
        if (cleaned.Count > MaxAliases)
        {
            throw KioskException.Invalid("aliases", $"A list can have at most {MaxAliases} aliases.");
        }

        if (cleaned.Any(a => a.Length > MaxListNameLength))
        {
            throw KioskException.Invalid("aliases", $"Aliases can be at most {MaxListNameLength} characters.");
        }

        return cleaned;
    }

    /// <summary>Names, slugs and aliases share one namespace so a spoken list name is never ambiguous.</summary>
    private static void EnsureNamesAreFree(IEnumerable<KioskList> lists, KioskList? except, IEnumerable<string> candidates)
    {
        var taken = lists
            .Where(l => l != except)
            .SelectMany(l => l.Aliases.Append(l.Slug).Append(TextNormalizer.NormalizeName(l.Name)))
            .ToHashSet();

        var clash = candidates.Select(TextNormalizer.NormalizeName).FirstOrDefault(taken.Contains);
        if (clash is not null)
        {
            throw KioskException.Conflict($"'{clash}' is already used by another list.");
        }
    }

    private static (string Text, string Normalized) CleanItemText(string? text)
    {
        var display = TextNormalizer.ToDisplay(text);
        if (display.Length == 0)
        {
            throw KioskException.Invalid("text", "The item text is required.");
        }

        if (display.Length > MaxItemTextLength)
        {
            throw KioskException.Invalid("text", $"The item text can be at most {MaxItemTextLength} characters.");
        }

        return (display, TextNormalizer.Normalize(text));
    }

    private static string? CleanQuantity(string? quantity)
    {
        var cleaned = quantity?.Trim();
        if (string.IsNullOrEmpty(cleaned))
        {
            return null;
        }

        if (cleaned.Length > MaxQuantityLength)
        {
            throw KioskException.Invalid("quantity", $"The quantity can be at most {MaxQuantityLength} characters.");
        }

        return cleaned;
    }
}
