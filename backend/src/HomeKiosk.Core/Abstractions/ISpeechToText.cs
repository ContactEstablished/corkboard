namespace HomeKiosk.Core.Abstractions;

public sealed record SttResult(string Text, int ElapsedMs);

/// <summary>
/// Local speech-to-text engine. Singleton. Loading takes seconds, so <c>SttWarmupService</c> calls
/// <see cref="LoadAsync"/> once at startup and reports progress through <c>ServiceHealth.Stt</c>.
/// </summary>
public interface ISpeechToText
{
    /// <summary>Every engine takes this rate. <see cref="IAudioDecoder"/> converts to it.</summary>
    const int SampleRate = 16_000;

    Task LoadAsync(CancellationToken ct);

    /// <param name="samples">16 kHz mono, in [-1, 1].</param>
    Task<SttResult> TranscribeAsync(float[] samples, CancellationToken ct);
}
