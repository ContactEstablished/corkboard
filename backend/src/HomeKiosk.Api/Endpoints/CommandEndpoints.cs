using HomeKiosk.Core.Commands;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using HomeKiosk.Core.Lists;

namespace HomeKiosk.Api.Endpoints;

public static class CommandEndpoints
{
    /// <summary>Typed or test commands from the kiosk.</summary>
    private static readonly CommandOrigin ApiOrigin = new(CommandSource.Api, "Kiosk");

    public static IEndpointRouteBuilder MapCommandEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").WithTags("Commands");

        api.MapPost("/commands", async (CommandRequest request, ICommandService commands, CancellationToken ct) =>
            {
                var text = request.Text ?? "";
                if (text.Length > CommandService.MaxTextLength)
                {
                    throw KioskException.Invalid("text", $"Commands can be at most {CommandService.MaxTextLength} characters.");
                }

                return TypedResults.Ok(await commands.HandleTextAsync(text, ApiOrigin, ct));
            })
            .WithSummary("Run a text command through the same pipeline as voice and Telegram")
            .ProducesValidationProblem();

        api.MapPost("/undo", async (ICommandService commands, CancellationToken ct) =>
                TypedResults.Ok(await commands.UndoLastAsync(ApiOrigin, ct)))
            .WithSummary("Revert the most recent command that changed something (one step)");

        api.MapGet("/commands/recent", async (int? take, ICommandService commands, CancellationToken ct) =>
                TypedResults.Ok(await commands.GetRecentAsync(take ?? 20, ct)))
            .WithSummary("Recent commands, newest first (take: 1–100, default 20)");

        return app;
    }
}
