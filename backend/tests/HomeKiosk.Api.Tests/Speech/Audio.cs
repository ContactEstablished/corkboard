using System.Buffers.Binary;
using System.Diagnostics;
using System.Text;
using HomeKiosk.Core.Abstractions;

namespace HomeKiosk.Api.Tests.Speech;

/// <summary>Test clips: synthetic WAVs, the recorded fixtures, and what the machine has installed.</summary>
public static class Audio
{
    /// <summary>A PCM16 WAV of a 440 Hz tone.</summary>
    public static byte[] Wav(double seconds, int rate = ISpeechToText.SampleRate, int channels = 1, int bits = 16)
    {
        var frames = (int)(seconds * rate);
        var bytesPerSample = bits / 8;
        var pcm = new byte[frames * channels * bytesPerSample];
        for (var i = 0; i < frames; i++)
        {
            var value = (short)(Math.Sin(2 * Math.PI * 440 * i / rate) * 8000);
            for (var c = 0; c < channels; c++)
            {
                var at = (i * channels + c) * bytesPerSample;
                if (bits == 16)
                {
                    BinaryPrimitives.WriteInt16LittleEndian(pcm.AsSpan(at), value);
                }
                else
                {
                    pcm[at] = (byte)((value >> 8) + 128);
                }
            }
        }

        return Riff(Fmt(1, channels, rate, bits), Chunk("data", pcm));
    }

    public static byte[] Fmt(ushort format, int channels, int rate, int bits)
    {
        var body = new byte[16];
        BinaryPrimitives.WriteUInt16LittleEndian(body, format);
        BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(2), (ushort)channels);
        BinaryPrimitives.WriteUInt32LittleEndian(body.AsSpan(4), (uint)rate);
        BinaryPrimitives.WriteUInt32LittleEndian(body.AsSpan(8), (uint)(rate * channels * bits / 8));
        BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(12), (ushort)(channels * bits / 8));
        BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(14), (ushort)bits);
        return Chunk("fmt ", body);
    }

    /// <summary>A chunk with its even-length padding.</summary>
    public static byte[] Chunk(string id, byte[] body, uint? declaredSize = null)
    {
        var chunk = new byte[8 + body.Length + (body.Length & 1)];
        Encoding.ASCII.GetBytes(id, chunk);
        BinaryPrimitives.WriteUInt32LittleEndian(chunk.AsSpan(4), declaredSize ?? (uint)body.Length);
        body.CopyTo(chunk, 8);
        return chunk;
    }

    public static byte[] Riff(params byte[][] chunks)
    {
        var body = chunks.SelectMany(c => c).ToArray();
        var riff = new byte[12 + body.Length];
        Encoding.ASCII.GetBytes("RIFF", riff);
        BinaryPrimitives.WriteUInt32LittleEndian(riff.AsSpan(4), (uint)(4 + body.Length));
        Encoding.ASCII.GetBytes("WAVE", riff.AsSpan(8));
        body.CopyTo(riff, 12);
        return riff;
    }

    /// <summary>A file from <c>tests/fixtures/</c> (copied next to the test assembly).</summary>
    public static byte[] Fixture(string name) => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures", name));

    private static readonly Lazy<bool> FfmpegInstalled = new(() =>
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo("ffmpeg", "-version")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            })!;
            process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch (Exception)
        {
            return false;
        }
    });

    public static void SkipWithoutFfmpeg() => Assert.SkipUnless(FfmpegInstalled.Value, "ffmpeg isn't on PATH");

    /// <summary>
    /// The downloaded Parakeet model: <c>KIOSK_STT_MODEL</c> if set, else <c>backend/models/parakeet-tdt-0.6b-v3-int8</c>.
    /// Null when it isn't there (run scripts/download-models).
    /// </summary>
    public static string? ModelDirectory()
    {
        var path = Environment.GetEnvironmentVariable("KIOSK_STT_MODEL");
        if (string.IsNullOrEmpty(path))
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "HomeKiosk.sln")))
            {
                dir = dir.Parent;
            }

            if (dir is null)
            {
                return null;
            }

            path = Path.Combine(dir.FullName, "models", "parakeet-tdt-0.6b-v3-int8");
        }

        return File.Exists(Path.Combine(path, "encoder.int8.onnx")) ? path : null;
    }
}
