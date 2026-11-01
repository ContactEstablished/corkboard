using System.Buffers.Binary;
using HomeKiosk.Core.Abstractions;

namespace HomeKiosk.Infrastructure.Speech;

/// <summary>
/// Fast path for the format the kiosk is asked to send: RIFF/WAVE, PCM, 16-bit, mono, 16 kHz.
/// Anything else (other rates, stereo, float, compressed, not a WAV at all) is left to ffmpeg.
/// </summary>
public static class WavDecoder
{
    private const ushort PcmFormat = 1;

    /// <returns>False when the clip isn't exactly the fast-path format. Never throws.</returns>
    public static bool TryDecode(ReadOnlySpan<byte> wav, out float[] samples)
    {
        samples = [];
        if (wav.Length < 12 || !wav[..4].SequenceEqual("RIFF"u8) || !wav[8..12].SequenceEqual("WAVE"u8))
        {
            return false;
        }

        var fmtSeen = false;
        var offset = 12;
        while (offset + 8 <= wav.Length)
        {
            var id = wav.Slice(offset, 4);
            var size = BinaryPrimitives.ReadUInt32LittleEndian(wav.Slice(offset + 4, 4));
            var body = offset + 8;
            // Streaming writers leave the size at 0 or 0xFFFFFFFF; take whatever is there.
            var length = (int)Math.Min(size, (uint)(wav.Length - body));

            if (id.SequenceEqual("fmt "u8))
            {
                if (length < 16)
                {
                    return false;
                }

                var fmt = wav.Slice(body, 16);
                var format = BinaryPrimitives.ReadUInt16LittleEndian(fmt);
                var channels = BinaryPrimitives.ReadUInt16LittleEndian(fmt[2..]);
                var rate = BinaryPrimitives.ReadUInt32LittleEndian(fmt[4..]);
                var bits = BinaryPrimitives.ReadUInt16LittleEndian(fmt[14..]);
                if (format != PcmFormat || channels != 1 || rate != ISpeechToText.SampleRate || bits != 16)
                {
                    return false;
                }

                fmtSeen = true;
            }
            else if (id.SequenceEqual("data"u8))
            {
                if (!fmtSeen)
                {
                    return false;
                }

                samples = ToFloats(wav.Slice(body, length));
                return true;
            }

            // Chunks are padded to an even length.
            offset = body + length + (length & 1);
        }

        return false;
    }

    /// <summary>Little-endian signed 16-bit PCM to [-1, 1]. A trailing odd byte is ignored.</summary>
    public static float[] ToFloats(ReadOnlySpan<byte> pcm16)
    {
        var samples = new float[pcm16.Length / 2];
        for (var i = 0; i < samples.Length; i++)
        {
            samples[i] = BinaryPrimitives.ReadInt16LittleEndian(pcm16.Slice(i * 2, 2)) / 32768f;
        }

        return samples;
    }
}
