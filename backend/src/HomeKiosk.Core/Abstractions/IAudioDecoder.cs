namespace HomeKiosk.Core.Abstractions;

public interface IAudioDecoder
{
    /// <summary>Decodes a clip to 16 kHz mono samples in [-1, 1].</summary>
    /// <param name="contentType">The uploader's claim (e.g. <c>audio/webm;codecs=opus</c>). A hint only.</param>
    /// <exception cref="InvalidDataException">The bytes aren't audio we can read.</exception>
    Task<float[]> DecodeAsync(ReadOnlyMemory<byte> audio, string? contentType, CancellationToken ct);
}
