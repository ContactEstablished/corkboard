using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Contracts;

public sealed record ListSummary(Guid Id, string Slug, string Name, bool IsDefault, int OpenCount, int CompletedCount);

/// <summary>A list with its items: open items first (oldest first), then completed (most recently completed first).</summary>
public sealed record ListDetail(Guid Id, string Slug, string Name, bool IsDefault, IReadOnlyList<ItemDto> Items);

public sealed record ItemDto(
    Guid Id,
    Guid ListId,
    string Text,
    string? Quantity,
    bool IsCompleted,
    DateTimeOffset? CompletedAt,
    string? AddedBy,
    CommandSource Source,
    DateTimeOffset CreatedAt);

public sealed record CreateListRequest(string Name, IReadOnlyList<string>? Aliases = null);

public sealed record UpdateListRequest(string? Name = null, IReadOnlyList<string>? Aliases = null, bool? IsDefault = null);

public sealed record AddItemRequest(string Text, string? Quantity = null);

/// <summary>Omitted fields are left unchanged. An empty <c>quantity</c> clears it.</summary>
public sealed record UpdateItemRequest(string? Text = null, string? Quantity = null, bool? IsCompleted = null);

public sealed record ClearListRequest(bool CompletedOnly = true);
