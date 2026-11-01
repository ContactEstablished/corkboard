using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace HomeKiosk.Api.Tests;

/// <summary>Boots the real API against a throwaway SQLite file. One per test class.</summary>
public sealed class KioskApiFactory : WebApplicationFactory<Program>
{
    public const string ApiKey = "test-kiosk-key-0123456789-0123456789-abcdef";

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly string _dataDirectory = Path.Combine(Path.GetTempPath(), "homekiosk-tests", Guid.NewGuid().ToString("N"));

    /// <summary>Extra configuration, applied over the test defaults.</summary>
    public Dictionary<string, string?> Settings { get; init; } = [];

    /// <summary>Service overrides, e.g. a fake <c>ISpeechToText</c>.</summary>
    public Action<IServiceCollection>? TestServices { get; init; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Kiosk"] = $"Data Source={Path.Combine(_dataDirectory, "kiosk.db")}",
            ["Kiosk:ApiKey"] = ApiKey,
            ["Kiosk:LogDirectory"] = Path.Combine(_dataDirectory, "logs"),
            // No model here, so STT ends up in the error state unless a test swaps in a fake or the real model.
            ["Stt:ModelPath"] = Path.Combine(_dataDirectory, "no-model"),
            ["Serilog:MinimumLevel:Default"] = "Warning",
            ["Serilog:MinimumLevel:Override:HomeKiosk.Infrastructure.Speech.SttWarmupService"] = "Fatal",
        }).AddInMemoryCollection(Settings));

        if (TestServices is { } configure)
        {
            builder.ConfigureTestServices(configure);
        }
    }

    /// <summary>A started SignalR connection to the kiosk hub, as the tablet would hold.</summary>
    public async Task<HubConnection> ConnectHubAsync(CancellationToken ct)
    {
        var server = Server;
        var hub = new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, "hubs/kiosk"), options =>
            {
                // TestServer has no real sockets, so use long polling; the key goes as a bearer token.
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
                options.AccessTokenProvider = () => Task.FromResult<string?>(ApiKey);
            })
            .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()))
            .Build();
        await hub.StartAsync(ct);
        return hub;
    }

    /// <summary>Polls <c>/api/health</c> until <paramref name="feature"/> ("stt", "telegram") reaches <paramref name="state"/>.</summary>
    public async Task WaitForHealthAsync(string feature, string state, TimeSpan timeout, CancellationToken ct)
    {
        var client = CreateClient();
        var deadline = DateTime.UtcNow + timeout;
        while (true)
        {
            using var health = JsonDocument.Parse(await client.GetStringAsync("/api/health", ct));
            var current = health.RootElement.GetProperty(feature).GetString();
            if (current == state)
            {
                return;
            }

            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException($"{feature} is still '{current}' after {timeout.TotalSeconds:0} s (waiting for '{state}').");
            }

            await Task.Delay(50, ct);
        }
    }

    /// <summary>Polls <c>/api/health</c> until STT reaches <paramref name="state"/> ("ready", "error"…).</summary>
    public Task WaitForSttAsync(string state, TimeSpan timeout, CancellationToken ct) => WaitForHealthAsync("stt", state, timeout, ct);

    /// <summary>A client that sends the kiosk key on every request.</summary>
    public HttpClient CreateKioskClient()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Kiosk-Key", ApiKey);
        return client;
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_dataDirectory, recursive: true);
        }
        catch (IOException)
        {
            // The log file can still be held briefly by the file sink; the temp dir is disposable anyway.
        }
    }
}

public static class HttpResponseExtensions
{
    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(KioskApiFactory.Json))!;
}
