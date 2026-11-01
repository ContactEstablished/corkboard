using HomeKiosk.Core.Abstractions;

namespace HomeKiosk.Infrastructure.Speech;

/// <summary>16 kHz mono PCM16 WAV is parsed in process; everything else goes through ffmpeg.</summary>
public sealed class AudioDecoder(FfmpegAudioDecoder ffmpeg) : IAudioDecoder
{
    public Task<float[]> DecodeAsync(ReadOnlyMemory<byte> audio, string? contentType, CancellationToken ct) =>
        // Sniff the bytes rather than trust the content type: browsers label WAV blobs inconsistently.
        WavDecoder.TryDecode(audio.Span, out var samples) ? Task.FromResult(samples) : ffmpeg.DecodeAsync(audio, ct);
}
