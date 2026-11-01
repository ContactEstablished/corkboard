using HomeKiosk.Core.Health;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Infrastructure.Telegram;

/// <summary>
/// Long-polls the Bot API (no inbound port or public URL needed) and hands each update to
/// <see cref="TelegramUpdateHandler"/>. Network errors back off from 1 s to 60 s with health "error";
/// a rejected token turns the bot off. Missing config never stops the app: the bot stays "disabled".
/// </summary>
public sealed class TelegramPollingService(
    ITelegramGateway gateway,
    IServiceScopeFactory scopes,
    ServiceHealth health,
    IOptions<TelegramOptions> options,
    ILogger<TelegramPollingService> logger) : BackgroundService
{
    public const int PollTimeoutSeconds = 30;
    private static readonly TimeSpan MaxBackoff = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!CanStart(options.Value))
        {
            return;
        }

        string? botUsername = null;
        long offset = 0;
        var backoff = TimeSpan.Zero;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (botUsername is null)
                {
                    botUsername = await gateway.ConnectAsync(TelegramUpdateHandler.SlashCommands, stoppingToken);
                    health.Telegram = TelegramState.Connected; // don't wait for the first long poll to return
                    logger.LogInformation("Telegram connected as @{BotUsername}; polling for messages", botUsername);
                }

                var updates = await gateway.GetUpdatesAsync(offset, PollTimeoutSeconds, stoppingToken);
                health.Telegram = TelegramState.Connected;
                backoff = TimeSpan.Zero;

                foreach (var update in updates)
                {
                    // Acknowledged by the next poll. If we stop first, it's redelivered and deduped by update ID.
                    offset = Math.Max(offset, update.UpdateId + 1);
                    await HandleAsync(update, botUsername, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (TelegramApiException ex) when (ex.ErrorCode is 401 or 404)
            {
                health.Telegram = TelegramState.Error;
                logger.LogError("Telegram rejected the bot token ({ErrorCode}). The bot is off until Telegram:BotToken is fixed and the app restarts", ex.ErrorCode);
                return;
            }
            catch (Exception ex)
            {
                health.Telegram = TelegramState.Error;
                backoff = backoff == TimeSpan.Zero ? TimeSpan.FromSeconds(1) : TimeSpan.FromTicks(Math.Min(backoff.Ticks * 2, MaxBackoff.Ticks));
                // The message only (no stack): these are expected when the network or Telegram is down.
                logger.LogWarning("Telegram polling failed ({Error}); retrying in {Backoff}", ex.Message, backoff);
                try
                {
                    await Task.Delay(backoff, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }

    private bool CanStart(TelegramOptions o)
    {
        if (!o.Enabled)
        {
            logger.LogInformation("Telegram is disabled (Telegram:Enabled = false)");
            return false;
        }

        if (string.IsNullOrWhiteSpace(o.BotToken))
        {
            logger.LogWarning("Telegram:BotToken is empty (env: Telegram__BotToken), so the Telegram bot is off");
            return false;
        }

        if (!string.Equals(o.Mode, TelegramOptions.Polling, StringComparison.OrdinalIgnoreCase))
        {
            health.Telegram = TelegramState.Error;
            logger.LogError("Telegram:Mode '{Mode}' isn't supported yet; use '{Polling}'. The bot is off", o.Mode, TelegramOptions.Polling);
            return false;
        }

        if (o.AllowedChats.Count == 0)
        {
            logger.LogWarning("Telegram:AllowedChats is empty: the bot will only tell each chat its ID so you can add it");
        }

        return true;
    }

    /// <summary>One bad update must not stop the loop.</summary>
    private async Task HandleAsync(TelegramUpdate update, string botUsername, CancellationToken ct)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<TelegramUpdateHandler>().HandleAsync(update, botUsername, ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Telegram update {UpdateId} failed", update.UpdateId);
        }
    }
}
