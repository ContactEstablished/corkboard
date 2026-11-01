using System.Diagnostics;
using HomeKiosk.Core.Abstractions;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using HomeKiosk.Core.Health;
using HomeKiosk.Core.Lists;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Core.Commands;

public sealed class CommandService(
    IKioskRepository repository,
    ICommandParser parser,
    CommandExecutor executor,
    IListNotifier notifier,
    IAudioDecoder audioDecoder,
    ISpeechToText speech,
    ServiceHealth health,
    IOptions<SttOptions> sttOptions,
    IClock clock,
    ILogger<CommandService> logger) : ICommandService
{
    public const int MaxTextLength = 500;

    /// <summary>Shorter clips are answered "I didn't catch that." without running STT.</summary>
    public const int MinClipMs = 300;

    private const string NoSpeech = "no speech";

    public Task<CommandResponse> HandleTextAsync(string text, CommandOrigin origin, CancellationToken ct) =>
        ProcessAsync(text, fixedCommands: null, origin, voice: null, Stopwatch.StartNew(), ct);

    public async Task<CommandResponse> HandleAudioAsync(Stream audio, string? contentType, CommandOrigin origin, CancellationToken ct)
    {
        var total = Stopwatch.StartNew();
        var options = sttOptions.Value;

        // Checked first so a kiosk retrying during startup doesn't pay for decoding.
        switch (health.Stt)
        {
            case SttState.Loading:
                throw KioskException.Unavailable("Speech recognition is still loading. Try again in a moment.");
            case SttState.Error:
                throw KioskException.Unavailable("Speech recognition isn't available. See /api/health and the server log.");
        }

        var bytes = await ReadAtMostAsync(audio, options.MaxUploadBytes, ct)
            ?? throw KioskException.TooLarge($"Audio clips can be at most {options.MaxUploadBytes / (1024.0 * 1024):0.#} MB.");

        float[] samples;
        try
        {
            samples = await audioDecoder.DecodeAsync(bytes, contentType, ct);
        }
        catch (InvalidDataException ex)
        {
            logger.LogWarning("Couldn't decode a {Bytes}-byte {ContentType} clip: {Reason}", bytes.Length, contentType, ex.Message);
            throw KioskException.Invalid("audio", "Couldn't read the audio. Send WAV (16 kHz mono preferred), WebM, Ogg or MP4.");
        }

        var durationMs = (int)(samples.LongLength * 1000 / ISpeechToText.SampleRate);
        if (durationMs > options.MaxSeconds * 1000)
        {
            throw KioskException.TooLarge($"Audio clips can be at most {options.MaxSeconds} seconds.");
        }

        var stt = durationMs < MinClipMs ? new SttResult("", 0) : await speech.TranscribeAsync(samples, ct);
        var transcript = stt.Text.Trim();
        var voice = new VoiceClip(durationMs, stt.ElapsedMs);

        if (transcript.Length == 0)
        {
            // The int8 Parakeet encoder is known to return nothing for some clear clips (spec 8.1): keep a trail.
            logger.LogWarning("Empty transcript for a {DurationMs} ms clip (STT {SttMs} ms)", durationMs, stt.ElapsedMs);
            return await ProcessAsync("", [new Unrecognized(NoSpeech)], origin, voice, total, ct);
        }

        return await ProcessAsync(transcript, fixedCommands: null, origin, voice, total, ct);
    }

    public Task<CommandResponse> HandleCommandsAsync(string rawText, IReadOnlyList<ListCommand> commands, CommandOrigin origin, CancellationToken ct) =>
        ProcessAsync(rawText, commands, origin, voice: null, Stopwatch.StartNew(), ct);

    public Task<CommandResponse> UndoLastAsync(CommandOrigin origin, CancellationToken ct) =>
        ProcessAsync(rawText: null, fixedCommands: [new Undo()], origin, voice: null, Stopwatch.StartNew(), ct);

    public async Task<IReadOnlyList<CommandLogSummary>> GetRecentAsync(int take, CancellationToken ct)
    {
        var logs = await repository.GetRecentCommandsAsync(Math.Clamp(take, 1, 100), ct);
        return
        [
            .. logs.Select(log => new CommandLogSummary(
                log.Id,
                log.CreatedAt,
                log.Source,
                log.RawText,
                log.Parser,
                log.Understood,
                [.. CommandJson.Deserialize(log.ActionsJson).Select(a => a.Action)],
                log.Reply,
                log.UserName,
                log.Error,
                log.Undone,
                new CommandTimings(log.SttMs, log.ParseMs, log.TotalMs))),
        ];
    }

    /// <summary>What a voice command adds to the log and the response.</summary>
    private sealed record VoiceClip(int DurationMs, int SttMs);

    /// <param name="fixedCommands">Commands to run without parsing (e.g. the undo button).</param>
    /// <param name="voice">Set for voice commands; <paramref name="rawText"/> is then the transcript.</param>
    /// <param name="total">Started when the request arrived, so voice timings include decoding and STT.</param>
    private async Task<CommandResponse> ProcessAsync(
        string? rawText,
        IReadOnlyList<ListCommand>? fixedCommands,
        CommandOrigin origin,
        VoiceClip? voice,
        Stopwatch total,
        CancellationToken ct)
    {
        var now = clock.UtcNow;
        var lists = (await repository.GetListsAsync(includeItems: true, ct)).ToList();

        // Telegram redelivers an update if we stopped before acknowledging it. Answer it again; don't apply it twice.
        if (origin.TelegramUpdateId is { } updateId
            && await repository.FindCommandByTelegramUpdateIdAsync(updateId, ct) is { } handled)
        {
            logger.LogInformation("Telegram update {UpdateId} was already handled as command {CommandId}", updateId, handled.Id);
            return Replay(handled, lists);
        }

        var parseTimer = Stopwatch.StartNew();
        var parsed = fixedCommands is not null
            ? new ParseResult(fixedCommands, ParseResult.None)
            : await parser.ParseAsync(rawText ?? "", BuildContext(lists, origin.Source, now), ct);
        var parseMs = (int)parseTimer.ElapsedMilliseconds;

        if (!parsed.Understood && origin.IgnoreUnrecognized)
        {
            // Group-chat conversation. Deliberately not logged: it isn't a command and may be private.
            return new CommandResponse(
                Guid.Empty, origin.Source, null, false, [], "", null, origin.UserName, new CommandTimings(0, parseMs, (int)total.ElapsedMilliseconds));
        }

        var log = new CommandLog
        {
            Id = Guid.CreateVersion7(now),
            Source = origin.Source,
            RawText = rawText,
            AudioDurationMs = voice?.DurationMs,
            SttMs = voice?.SttMs ?? 0,
            Parser = parsed.Parser,
            Understood = parsed.Understood,
            UserName = origin.UserName,
            TelegramChatId = origin.TelegramChatId,
            TelegramUpdateId = origin.TelegramUpdateId,
            ParseMs = parseMs,
            CreatedAt = now,
        };

        ExecutionResult result;
        try
        {
            result = await executor.ExecuteAsync(parsed.Commands, lists, log.Id, origin, ct);
            log.Reply = parsed.Commands is [Unrecognized { Reason: NoSpeech }] ? ReplyFormatter.NotHeard : ReplyFormatter.Format(result);
            log.ActionsJson = CommandJson.Serialize(result.Actions.Select(a => a.ToLogged()));
            Finish(log, total);
            repository.Add(log);
            await repository.SaveChangesAsync(ct); // item changes and their log entry commit together
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Command {CommandId} failed; nothing was changed", log.Id);
            repository.DiscardChanges();
            result = new ExecutionResult();
            log.Reply = ReplyFormatter.Failed;
            log.Error = ex.Message;
            log.ActionsJson = CommandJson.Serialize(FailedActions(parsed));
            Finish(log, total);
            repository.Add(log);
            await repository.SaveChangesAsync(ct);
        }

        var actions = CommandJson.Deserialize(log.ActionsJson).Select(a => a.Action).ToList();
        var response = new CommandResponse(
            log.Id,
            origin.Source,
            Transcript: voice is null ? null : rawText,
            parsed.Understood,
            actions,
            log.Reply,
            result.MainList is { } main ? ListMapper.ToDetail(main) : null,
            origin.UserName,
            new CommandTimings(log.SttMs, log.ParseMs, log.TotalMs));

        await PublishAsync(result, lists, response, ct);

        logger.LogInformation(
            "Command {CommandId} from {Source} ({UserName}) parsed by {Parser}: understood={Understood} {@Actions} stt={SttMs}ms parse={ParseMs}ms total={TotalMs}ms",
            log.Id,
            log.Source,
            log.UserName,
            log.Parser,
            log.Understood,
            actions,
            log.SttMs,
            log.ParseMs,
            log.TotalMs);

        return response;
    }

    /// <summary>The response a logged command gave, with its main list as it is now.</summary>
    private static CommandResponse Replay(CommandLog log, IReadOnlyList<KioskList> lists)
    {
        var actions = CommandJson.Deserialize(log.ActionsJson).Select(a => a.Action).ToList();
        var main = actions.Select(a => lists.FirstOrDefault(l => l.Slug == a.List)).FirstOrDefault(l => l is not null);
        return new CommandResponse(
            log.Id,
            log.Source,
            log.Source is CommandSource.Voice or CommandSource.TelegramVoice ? log.RawText : null,
            log.Understood,
            actions,
            log.Reply,
            main is null ? null : ListMapper.ToDetail(main),
            log.UserName,
            new CommandTimings(log.SttMs, log.ParseMs, log.TotalMs));
    }

    private async Task PublishAsync(ExecutionResult result, List<KioskList> lists, CommandResponse response, CancellationToken ct)
    {
        foreach (var list in result.ChangedLists.Where(l => l.DeletedAt is null))
        {
            await notifier.ListChangedAsync(ListMapper.ToDetail(list), ct);
        }

        if (result.ListsChanged)
        {
            await notifier.ListsChangedAsync(ListMapper.ToSummaries(lists.Where(l => l.DeletedAt is null)), ct);
        }

        await notifier.CommandProcessedAsync(response, ct);
    }

    internal static ParseContext BuildContext(IReadOnlyList<KioskList> lists, CommandSource source, DateTimeOffset now) =>
        new(
            [.. lists.Select(CommandExecutor.Summary)],
            (lists.FirstOrDefault(l => l.IsDefault) ?? lists.FirstOrDefault())?.Slug ?? "",
            lists.ToDictionary(
                l => l.Slug,
                l => (IReadOnlyList<string>)[.. l.Items.Where(i => i.DeletedAt is null && !i.IsCompleted).Select(i => i.Text)]),
            source,
            now);

    private static IEnumerable<LoggedAction> FailedActions(ParseResult parsed) =>
        parsed.Commands
            .Select(c => c switch
            {
                AddItems a => new ActionDto(ActionType.AddItems, a.List, [.. a.Items.Select(i => i.Text)], ActionStatus.Failed),
                RemoveItems r => new ActionDto(ActionType.RemoveItems, r.List, r.Items, ActionStatus.Failed),
                CompleteItems d => new ActionDto(ActionType.CompleteItems, d.List, d.Items, ActionStatus.Failed),
                GetList g => new ActionDto(ActionType.GetList, g.List, [], ActionStatus.Failed),
                GetLists => new ActionDto(ActionType.GetLists, null, [], ActionStatus.Failed),
                ClearList k => new ActionDto(ActionType.ClearList, k.List, [], ActionStatus.Failed),
                CreateList n => new ActionDto(ActionType.CreateList, null, [n.Name], ActionStatus.Failed),
                Undo => new ActionDto(ActionType.Undo, null, [], ActionStatus.Failed),
                _ => null,
            })
            .OfType<ActionDto>()
            .Select(a => new LoggedAction(a, []));

    /// <summary>The whole stream, or null when it's longer than <paramref name="limit"/> bytes.</summary>
    private static async Task<byte[]?> ReadAtMostAsync(Stream stream, int limit, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > limit)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    private static void Finish(CommandLog log, Stopwatch total) => log.TotalMs = (int)total.ElapsedMilliseconds;
}
