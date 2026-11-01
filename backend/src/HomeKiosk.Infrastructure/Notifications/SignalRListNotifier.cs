using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Contracts;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace HomeKiosk.Infrastructure.Notifications;

/// <summary>
/// Broadcasts to every connected kiosk. Generic over the hub so the hub itself can live in the API project.
/// A failed broadcast is logged, never thrown: the write it reports has already committed.
/// </summary>
public sealed class SignalRListNotifier<THub>(IHubContext<THub, IKioskClient> hub, ILogger<SignalRListNotifier<THub>> logger)
    : IListNotifier
    where THub : Hub<IKioskClient>
{
    public Task ListChangedAsync(ListDetail list, CancellationToken ct) =>
        SendAsync(nameof(IKioskClient.ListChanged), () => hub.Clients.All.ListChanged(list));

    public Task ListsChangedAsync(IReadOnlyList<ListSummary> lists, CancellationToken ct) =>
        SendAsync(nameof(IKioskClient.ListsChanged), () => hub.Clients.All.ListsChanged(lists));

    public Task CommandProcessedAsync(CommandResponse response, CancellationToken ct) =>
        SendAsync(nameof(IKioskClient.CommandProcessed), () => hub.Clients.All.CommandProcessed(response));

    private async Task SendAsync(string eventName, Func<Task> send)
    {
        try
        {
            await send();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to broadcast {Event}", eventName);
        }
    }
}
