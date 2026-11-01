using System.Diagnostics;
using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Health;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Infrastructure.Speech;

/// <summary>
/// Loads the STT model in the background so the API is up while it loads (<c>/api/voice</c> answers 503 until
/// then), and decodes a second of silence so the first real clip doesn't pay for ONNX's lazy initialization.
/// A missing or broken model leaves STT in the error state; everything else keeps working.
/// </summary>
public sealed class SttWarmupService(
    ISpeechToText speech,
    ServiceHealth health,
    IOptions<SttOptions> options,
    ILogger<SttWarmupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!string.Equals(options.Value.Engine, SttOptions.Parakeet, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogError("Stt:Engine '{Engine}' isn't supported; use '{Parakeet}'. Voice commands are off", options.Value.Engine, SttOptions.Parakeet);
            health.Stt = SttState.Error;
            return;
        }

        health.Stt = SttState.Loading;
        try
        {
            var timer = Stopwatch.StartNew();
            await speech.LoadAsync(stoppingToken);
            var loadMs = timer.ElapsedMilliseconds;

            var warmup = await speech.TranscribeAsync(new float[ISpeechToText.SampleRate], stoppingToken);
            health.Stt = SttState.Ready;
            logger.LogInformation("STT ready: model loaded in {LoadMs} ms, warm-up decode {WarmupMs} ms", loadMs, warmup.ElapsedMs);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down before the model finished loading.
        }
        catch (FileNotFoundException ex)
        {
            health.Stt = SttState.Error;
            logger.LogError("{Reason} Voice commands are off until then", ex.Message); // no stack trace for a setup step
        }
        catch (Exception ex)
        {
            health.Stt = SttState.Error;
            logger.LogError(ex, "STT failed to load. Voice commands are off until it's fixed and the app restarts");
        }
    }
}
