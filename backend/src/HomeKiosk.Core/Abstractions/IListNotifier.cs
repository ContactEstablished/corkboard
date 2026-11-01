using HomeKiosk.Core.Contracts;

namespace HomeKiosk.Core.Abstractions;

/// <summary>Pushes changes to connected kiosks. Implementations must not throw.</summary>
public interface IListNotifier
{
    Task ListChangedAsync(ListDetail list, CancellationToken ct);

    Task ListsChangedAsync(IReadOnlyList<ListSummary> lists, CancellationToken ct);

    /// <summary>Sent for every command from any source, e.g. for an "Added eggs (via Telegram)" toast.</summary>
    Task CommandProcessedAsync(CommandResponse response, CancellationToken ct);
}
