using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Commands;

/// <summary>Who sent a command. <paramref name="UserName"/> becomes <c>AddedBy</c> on new items.</summary>
/// <param name="TelegramUpdateId">Set for Telegram: a redelivered update returns the stored response instead of running again.</param>
/// <param name="IgnoreUnrecognized">
/// Group chats: text no parser understands is conversation, not a command. It is not logged, broadcast or
/// answered; the response comes back with <c>Understood = false</c> and an empty <c>CommandId</c>.
/// </param>
public sealed record CommandOrigin(
    CommandSource Source,
    string? UserName,
    long? TelegramChatId = null,
    long? TelegramUpdateId = null,
    bool IgnoreUnrecognized = false);

/// <summary>The one command pipeline: parse → execute → log → notify, whatever the source.</summary>
public interface ICommandService
{
    Task<CommandResponse> HandleTextAsync(string text, CommandOrigin origin, CancellationToken ct);

    /// <summary>Transcribes a clip, then handles the transcript exactly like typed text.</summary>
    /// <exception cref="Lists.KioskException">413 over the size/length limits, 400 unreadable, 503 STT not ready.</exception>
    Task<CommandResponse> HandleAudioAsync(Stream audio, string? contentType, CommandOrigin origin, CancellationToken ct);

    /// <summary>Runs commands that are already parsed (Telegram slash commands) through execute → log → notify.</summary>
    /// <param name="rawText">What the user sent, for the log (e.g. "/list grocery").</param>
    Task<CommandResponse> HandleCommandsAsync(string rawText, IReadOnlyList<ListCommand> commands, CommandOrigin origin, CancellationToken ct);

    /// <summary>Reverts the most recent command that changed something (one step only).</summary>
    Task<CommandResponse> UndoLastAsync(CommandOrigin origin, CancellationToken ct);

    Task<IReadOnlyList<CommandLogSummary>> GetRecentAsync(int take, CancellationToken ct);
}
