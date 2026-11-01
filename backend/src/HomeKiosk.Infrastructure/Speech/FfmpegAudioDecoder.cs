using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using HomeKiosk.Core.Abstractions;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Infrastructure.Speech;

/// <summary>
/// Converts anything ffmpeg can read (WebM/Ogg Opus, MP4/AAC, other WAVs) to 16 kHz mono by piping it through
/// <c>ffmpeg … -f s16le pipe:1</c>. Needs ffmpeg on PATH (in the Docker image; <c>winget install ffmpeg</c> for dev).
/// </summary>
public sealed class FfmpegAudioDecoder(IOptions<SttOptions> options)
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    /// <exception cref="InvalidDataException">ffmpeg couldn't decode it, or took longer than <see cref="Timeout"/>.</exception>
    /// <exception cref="InvalidOperationException">ffmpeg isn't installed.</exception>
    public async Task<float[]> DecodeAsync(ReadOnlyMemory<byte> audio, CancellationToken ct)
    {
        var start = new ProcessStartInfo("ffmpeg")
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        // Stop one second past the limit: enough for the caller to reject the clip without decoding all of it.
        var maxSeconds = (options.Value.MaxSeconds + 1).ToString(CultureInfo.InvariantCulture);
        foreach (var arg in new[]
                 {
                     "-hide_banner", "-loglevel", "error", "-nostdin", "-i", "pipe:0", "-t", maxSeconds,
                     "-ac", "1", "-ar", ISpeechToText.SampleRate.ToString(CultureInfo.InvariantCulture), "-f", "s16le", "pipe:1",
                 })
        {
            start.ArgumentList.Add(arg);
        }

        using var process = new Process { StartInfo = start };
        try
        {
            process.Start();
        }
        catch (Win32Exception ex)
        {
            throw new InvalidOperationException("ffmpeg was not found on PATH. It's needed for audio that isn't 16 kHz mono WAV.", ex);
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(Timeout);
        try
        {
            using var pcm = new MemoryStream();
            var stdout = process.StandardOutput.BaseStream.CopyToAsync(pcm, timeout.Token);
            var stderr = process.StandardError.ReadToEndAsync(timeout.Token);
            await WriteInputAsync(process, audio, timeout.Token);
            await Task.WhenAll(stdout, stderr);
            await process.WaitForExitAsync(timeout.Token);

            if (process.ExitCode != 0)
            {
                var reason = (await stderr).Trim();
                throw new InvalidDataException($"ffmpeg exited with {process.ExitCode}: {(reason.Length > 300 ? reason[..300] : reason)}");
            }

            return WavDecoder.ToFloats(pcm.GetBuffer().AsSpan(0, (int)pcm.Length));
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new InvalidDataException($"ffmpeg took longer than {Timeout.TotalSeconds:0} s.");
        }
        finally
        {
            try
            {
                process.Kill(entireProcessTree: true); // no-op once it has exited
            }
            catch (InvalidOperationException)
            {
                // Exited between the check and the kill.
            }
        }
    }

    private static async Task WriteInputAsync(Process process, ReadOnlyMemory<byte> audio, CancellationToken ct)
    {
        try
        {
            await process.StandardInput.BaseStream.WriteAsync(audio, ct);
            process.StandardInput.Close(); // EOF: ffmpeg starts flushing its output
        }
        catch (IOException)
        {
            // ffmpeg gave up on the input and closed the pipe; its exit code and stderr say why.
        }
    }
}
