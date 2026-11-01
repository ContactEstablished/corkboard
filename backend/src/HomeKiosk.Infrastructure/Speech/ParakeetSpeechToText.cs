using System.Diagnostics;
using HomeKiosk.Core.Abstractions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using SherpaOnnx;

namespace HomeKiosk.Infrastructure.Speech;

/// <summary>
/// NVIDIA Parakeet TDT 0.6B v3 (int8) through sherpa-onnx, on the CPU. Outputs punctuation and casing.
/// Decodes are serialized: one kiosk plus the odd Telegram voice note never needs more.
/// </summary>
public sealed class ParakeetSpeechToText(IOptions<SttOptions> options, IHostEnvironment environment) : ISpeechToText, IDisposable
{
    public static readonly string[] ModelFiles = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"];

    private readonly SemaphoreSlim _gate = new(1, 1);
    private OfflineRecognizer? _recognizer;

    public string ModelDirectory => Path.GetFullPath(options.Value.ModelPath, environment.ContentRootPath);

    /// <exception cref="FileNotFoundException">A model file is missing (run scripts/download-models).</exception>
    public Task LoadAsync(CancellationToken ct) => Task.Run(
        () =>
        {
            var dir = ModelDirectory;
            if (ModelFiles.FirstOrDefault(f => !File.Exists(Path.Combine(dir, f))) is { } missing)
            {
                throw new FileNotFoundException(
                    $"STT model file '{missing}' not found in '{dir}'. Run scripts/download-models.(sh|ps1) or set Stt:ModelPath.",
                    Path.Combine(dir, missing));
            }

            var config = new OfflineRecognizerConfig();
            config.FeatConfig.SampleRate = ISpeechToText.SampleRate;
            config.FeatConfig.FeatureDim = 80;
            config.ModelConfig.Transducer.Encoder = Path.Combine(dir, "encoder.int8.onnx");
            config.ModelConfig.Transducer.Decoder = Path.Combine(dir, "decoder.int8.onnx");
            config.ModelConfig.Transducer.Joiner = Path.Combine(dir, "joiner.int8.onnx");
            config.ModelConfig.Tokens = Path.Combine(dir, "tokens.txt");
            config.ModelConfig.ModelType = "nemo_transducer";
            config.ModelConfig.NumThreads = options.Value.NumThreads;
            config.DecodingMethod = "greedy_search";

            var recognizer = new OfflineRecognizer(config);
            Interlocked.Exchange(ref _recognizer, recognizer)?.Dispose();
        },
        ct);

    public async Task<SttResult> TranscribeAsync(float[] samples, CancellationToken ct)
    {
        var recognizer = _recognizer ?? throw new InvalidOperationException("The STT model isn't loaded yet.");
        await _gate.WaitAsync(ct);
        try
        {
            var timer = Stopwatch.StartNew();
            using var stream = recognizer.CreateStream();
            stream.AcceptWaveform(ISpeechToText.SampleRate, samples);
            recognizer.Decode(stream);
            return new SttResult(stream.Result.Text.Trim(), (int)timer.ElapsedMilliseconds);
        }
        finally
        {
            _gate.Release();
        }
    }

    public void Dispose()
    {
        _recognizer?.Dispose();
        _gate.Dispose();
    }
}
