using System.Reflection;
using HomeKiosk.Core.Health;
using HomeKiosk.Infrastructure.Persistence;

namespace HomeKiosk.Api.Endpoints;

public static class HealthEndpoints
{
    private static readonly string Version =
        typeof(HealthEndpoints).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            .Split('+')[0]
        ?? "0.0.0";

    public sealed record HealthResponse(string Status, SttState Stt, TelegramState Telegram, string Version);

    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/health", async (KioskDbContext db, ServiceHealth health, CancellationToken ct) =>
            {
                var status = await db.Database.CanConnectAsync(ct) ? "ok" : "degraded";
                return TypedResults.Ok(new HealthResponse(status, health.Stt, health.Telegram, Version));
            })
            .WithTags("Health")
            .WithSummary("Liveness and feature status. No auth required.")
            .AllowAnonymous();

        return app;
    }
}
