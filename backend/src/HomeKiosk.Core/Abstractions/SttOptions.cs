using System.ComponentModel.DataAnnotations;

namespace HomeKiosk.Core.Abstractions;

public sealed class SttOptions
{
    public const string Section = "Stt";

    public const string Parakeet = "Parakeet";

    /// <summary>Only <see cref="Parakeet"/> for now. Anything else leaves STT in the error state.</summary>
    public string Engine { get; set; } = Parakeet;

    /// <summary>Folder with encoder/decoder/joiner .onnx and tokens.txt. Relative paths resolve against the content root.</summary>
    public string ModelPath { get; set; } = "/models/parakeet-tdt-0.6b-v3-int8";

    [Range(1, 64)]
    public int NumThreads { get; set; } = 4;

    /// <summary>Longer clips get 413.</summary>
    [Range(1, 300)]
    public int MaxSeconds { get; set; } = 30;

    /// <summary>Bigger uploads get 413.</summary>
    [Range(1024, 50 * 1024 * 1024)]
    public int MaxUploadBytes { get; set; } = 2 * 1024 * 1024;
}
