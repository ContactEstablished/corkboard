using HomeKiosk.Infrastructure.Notifications;
using Microsoft.AspNetCore.SignalR;

namespace HomeKiosk.Api.Hubs;

/// <summary>
/// Server → client only: <c>ListChanged</c> and <c>ListsChanged</c> (see <see cref="IKioskClient"/>).
/// No client methods in v1; all writes go through REST. Protected by the fallback auth policy.
/// </summary>
public sealed class KioskHub : Hub<IKioskClient>
{
    public const string Path = "/hubs/kiosk";
}
