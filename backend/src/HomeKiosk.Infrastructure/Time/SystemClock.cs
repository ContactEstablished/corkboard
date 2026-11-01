using HomeKiosk.Core.Abstractions;

namespace HomeKiosk.Infrastructure.Time;

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
