using System.Collections.Concurrent;
using HomeKiosk.Core.Abstractions;

namespace HomeKiosk.Api.Tests.Speech;

/// <summary>Says whatever <see cref="Transcript"/> is. With <see cref="HoldLoading"/>, stays "loading" until released.</summary>
public sealed class FakeSpeechToText : ISpeechToText
{
    public const int SttMs = 42;

    private readonly TaskCompletionSource _loaded = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public bool HoldLoading { get; init; }

    public string Transcript { get; set; } = "";

    /// <summary>Every clip transcribed, including the warm-up second of silence.</summary>
    public ConcurrentQueue<float[]> Clips { get; } = new();

    public void FinishLoading() => _loaded.TrySetResult();

    public Task LoadAsync(CancellationToken ct) => HoldLoading ? _loaded.Task.WaitAsync(ct) : Task.CompletedTask;

    public Task<SttResult> TranscribeAsync(float[] samples, CancellationToken ct)
    {
        Clips.Enqueue(samples);
        return Task.FromResult(new SttResult(Transcript, SttMs));
    }
}
