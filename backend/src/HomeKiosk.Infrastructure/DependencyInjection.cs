using HomeKiosk.Core.Abstractions;
using HomeKiosk.Infrastructure.Persistence;
using HomeKiosk.Infrastructure.Speech;
using HomeKiosk.Infrastructure.Telegram;
using HomeKiosk.Infrastructure.Time;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace HomeKiosk.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddKioskInfrastructure(this IServiceCollection services)
    {
        // Resolved lazily so test hosts can override the connection string.
        services.AddDbContext<KioskDbContext>((sp, options) =>
            options.UseSqlite(ResolveConnectionString(
                sp.GetRequiredService<IConfiguration>(),
                sp.GetRequiredService<IHostEnvironment>().ContentRootPath)));

        services.AddScoped<IKioskRepository, KioskRepository>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddHostedService<DatabaseInitializer>();
        return services;
    }

    /// <summary>Parakeet STT (loaded in the background) and the WAV/ffmpeg audio decoders. Needs <c>SttOptions</c> bound.</summary>
    public static IServiceCollection AddKioskSpeech(this IServiceCollection services)
    {
        services.AddSingleton<ISpeechToText, ParakeetSpeechToText>();
        services.AddSingleton<FfmpegAudioDecoder>();
        services.AddSingleton<IAudioDecoder, AudioDecoder>();
        services.AddHostedService<SttWarmupService>();
        return services;
    }

    /// <summary>The Telegram bot (long polling). Needs <see cref="TelegramOptions"/> bound; turns itself off without a token.</summary>
    public static IServiceCollection AddKioskTelegram(this IServiceCollection services)
    {
        services.AddSingleton<ITelegramGateway, TelegramBotApiGateway>();
        services.AddScoped<TelegramUpdateHandler>();
        services.AddHostedService<TelegramPollingService>();
        return services;
    }

    /// <summary>Resolves a relative SQLite path against the content root and creates its directory.</summary>
    private static string ResolveConnectionString(IConfiguration configuration, string contentRoot)
    {
        var builder = new SqliteConnectionStringBuilder(
            configuration.GetConnectionString("Kiosk")
                ?? throw new InvalidOperationException("ConnectionStrings:Kiosk is not configured."));

        if (builder.DataSource is not ("" or ":memory:"))
        {
            builder.DataSource = Path.GetFullPath(builder.DataSource, contentRoot);
            Directory.CreateDirectory(Path.GetDirectoryName(builder.DataSource)!);
        }

        return builder.ToString();
    }
}
