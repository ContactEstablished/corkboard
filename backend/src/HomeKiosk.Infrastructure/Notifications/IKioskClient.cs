using HomeKiosk.Core.Contracts;

namespace HomeKiosk.Infrastructure.Notifications;

/// <summary>Server → client events on <c>/hubs/kiosk</c>. Method names are the event names.</summary>
public interface IKioskClient
{
    Task ListChanged(ListDetail list);

    Task ListsChanged(IReadOnlyList<ListSummary> lists);

    Task CommandProcessed(CommandResponse response);
}
