using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Commands;
using HomeKiosk.Core.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Api.Endpoints;

public static class VoiceEndpoints
{
    /// <summary>Push-to-talk on the tablet.</summary>
    private static readonly CommandOrigin VoiceOrigin = new(CommandSource.Voice, "Kiosk");

    /// <summary>Room for the multipart boundaries and headers around the clip itself.</summary>
    private const int MultipartOverheadBytes = 16 * 1024;

    public static IEndpointRouteBuilder MapVoiceEndpoints(this IEndpointRouteBuilder app)
    {
        var maxUploadBytes = app.ServiceProvider.GetRequiredService<IOptions<SttOptions>>().Value.MaxUploadBytes;

        app.MapPost("/api/voice", async (IFormFile audio, ICommandService commands, CancellationToken ct) =>
            {
                await using var stream = audio.OpenReadStream();
                return TypedResults.Ok(await commands.HandleAudioAsync(stream, audio.ContentType, VoiceOrigin, ct));
            })
            .WithTags("Commands")
            .WithSummary("Transcribe a push-to-talk clip and run it as a command")
            .WithDescription(
                "multipart/form-data with the clip in field `audio`. Fastest as 16 kHz mono 16-bit PCM WAV; " +
                "WebM, Ogg (Opus) and MP4 are converted with ffmpeg. At most 30 s and 2 MB (413). A clip under 0.3 s or " +
                "with no words gets 200 with understood=false and \"I didn't catch that.\". 503 while the speech model loads.")
            // The kiosk authenticates with a header, not a cookie, so there is nothing for antiforgery to protect.
            .DisableAntiforgery()
            // Kestrel cuts off bodies well past the limit; CommandService enforces the exact clip size.
            .WithMetadata(new RequestSizeLimitAttribute(maxUploadBytes + MultipartOverheadBytes))
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        return app;
    }
}
