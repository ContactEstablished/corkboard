using System.Text.Json;
using System.Text.Json.Serialization;
using HomeKiosk.Api.Auth;
using HomeKiosk.Api.Endpoints;
using HomeKiosk.Api.ErrorHandling;
using HomeKiosk.Api.Hubs;
using HomeKiosk.Api.OpenApi;
using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Commands;
using HomeKiosk.Core.Health;
using HomeKiosk.Core.Lists;
using HomeKiosk.Infrastructure;
using HomeKiosk.Infrastructure.Notifications;
using HomeKiosk.Infrastructure.Telegram;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Everything below reads configuration lazily (options, factories) so test hosts can override it.
builder.Services.AddSerilog((services, logger) =>
{
    var environment = services.GetRequiredService<IHostEnvironment>();
    var logDirectory = Path.GetFullPath(
        services.GetRequiredService<IOptions<KioskOptions>>().Value.LogDirectory,
        environment.ContentRootPath);

    logger
        .ReadFrom.Configuration(builder.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.Console()
        .WriteTo.File(
            Path.Combine(logDirectory, "kiosk-.log"),
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 14);
});

builder.Services.AddOptions<KioskOptions>()
    .BindConfiguration(KioskOptions.Section)
    .ValidateDataAnnotations()
    .ValidateOnStart();

// Enums go over the wire as camelCase strings ("voice", "telegramVoice"), over REST and SignalR alike.
var enumConverter = new JsonStringEnumConverter(JsonNamingPolicy.CamelCase);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(enumConverter));
builder.Services.AddSignalR().AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(enumConverter));

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<KioskExceptionHandler>();
// Expected failures (404/409/400) are answered as ProblemDetails, not logged as unhandled errors.
builder.Services.Configure<ExceptionHandlerOptions>(o =>
    o.SuppressDiagnosticsCallback = context => context.Exception is KioskException or BadHttpRequestException);

builder.Services.AddAuthentication(KioskKeyAuthHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, KioskKeyAuthHandler>(KioskKeyAuthHandler.SchemeName, null);
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder(KioskKeyAuthHandler.SchemeName).RequireAuthenticatedUser().Build());

// Only needed when the front end isn't served from wwwroot (e.g. the Vite dev server).
builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>().Configure<IConfiguration>((cors, configuration) =>
{
    var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
    if (origins.Length > 0)
    {
        cors.AddDefaultPolicy(policy => policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials());
    }
});

builder.Services.AddOpenApi(o => o.AddDocumentTransformer<KioskKeySecurityTransformer>());

builder.Services.AddOptions<SttOptions>()
    .BindConfiguration(SttOptions.Section)
    .ValidateDataAnnotations()
    .ValidateOnStart();

// Not validated on start: a misconfigured bot only turns Telegram off (reported by /api/health).
builder.Services.AddOptions<TelegramOptions>().BindConfiguration(TelegramOptions.Section);

builder.Services.AddKioskInfrastructure();
builder.Services.AddKioskSpeech();
builder.Services.AddKioskTelegram();
builder.Services.AddScoped<ListService>();
builder.Services.AddSingleton<ICommandParser, RuleBasedCommandParser>();
builder.Services.AddScoped<CommandExecutor>();
builder.Services.AddScoped<ICommandService, CommandService>();
builder.Services.AddSingleton<IListNotifier, SignalRListNotifier<KioskHub>>();
// STT starts as "loading" and Telegram as "disabled"; their hosted services move them on.
builder.Services.AddSingleton(new ServiceHealth());

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

// The built front end can be dropped into wwwroot/ and served from the same origin (no CORS needed).
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi().AllowAnonymous();
app.MapScalarApiReference().AllowAnonymous();

app.MapHealthEndpoints();
app.MapListEndpoints();
app.MapItemEndpoints();
app.MapCommandEndpoints();
app.MapVoiceEndpoints();
app.MapHub<KioskHub>(KioskHub.Path);

app.Run();

public partial class Program;
