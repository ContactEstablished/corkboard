namespace HomeKiosk.Core.Health;

public enum SttState
{
    Loading,
    Ready,
    Error,
}

public enum TelegramState
{
    Disabled,
    Connected,
    Error,
}

/// <summary>Live state of the optional subsystems, reported by <c>/api/health</c>. Singleton.</summary>
public sealed class ServiceHealth
{
    private volatile SttState _stt = SttState.Loading;
    private volatile TelegramState _telegram = TelegramState.Disabled;

    public SttState Stt
    {
        get => _stt;
        set => _stt = value;
    }

    public TelegramState Telegram
    {
        get => _telegram;
        set => _telegram = value;
    }
}
