using HomeKiosk.Core.Commands;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HomeKiosk.Infrastructure.Telegram;

/// <summary>
/// One Telegram update → allowlist check → the shared command pipeline → an HTML reply. Scoped (one per update).
/// </summary>
public sealed class TelegramUpdateHandler(
    ICommandService commands,
    ITelegramGateway gateway,
    IOptions<TelegramOptions> options,
    ILogger<TelegramUpdateHandler> logger)
{
    public static readonly IReadOnlyList<TelegramBotCommand> SlashCommands =
    [
        new("list", "Show a list: /list or /list to-do"),
        new("lists", "Show all lists"),
        new("add", "Add items: /add milk, eggs"),
        new("done", "Check off an item: /done milk"),
        new("clear", "Clear completed items: /clear or /clear to-do"),
        new("undo", "Undo the last change"),
        new("help", "What I understand"),
    ];

    public const string Help =
        "<b>Home Kiosk</b>\n" +
        "Just tell me what you need:\n" +
        "• add milk, eggs and bread\n" +
        "• put two gallons of milk on the list\n" +
        "• what's on the grocery list?\n" +
        "• check off eggs\n" +
        "• take bananas off groceries\n" +
        "• create a list called Camping\n" +
        "• undo\n\n" +
        "Or use /list, /lists, /add, /done, /clear (completed items) and /undo.";

    public const string VoiceNotYet = "I can't listen to voice notes yet. Please type it instead.";

    public static string Private(long chatId) => $"This bot is private. Your chat ID is {chatId}. Ask the admin to add it.";

    /// <param name="botUsername">This bot's username, to tell <c>/list@ThisBot</c> from another bot's command.</param>
    public async Task HandleAsync(TelegramUpdate update, string botUsername, CancellationToken ct)
    {
        if (update.Message is not { } message)
        {
            return;
        }

        var allowed = options.Value.AllowedChats.FirstOrDefault(c => c.ChatId == message.ChatId);
        if (allowed is null)
        {
            logger.LogWarning(
                "Telegram chat {ChatId} isn't on the allowlist (sender {Sender}); told it its chat ID and ignored the message",
                message.ChatId,
                message.SenderFirstName);
            await gateway.SendMessageAsync(message.ChatId, Private(message.ChatId), null, ct);
            return;
        }

        // In a group the allowlist entry names the group; the person is the sender.
        var userName = message.IsGroup ? message.SenderFirstName ?? allowed.Name : allowed.Name;
        var origin = new CommandOrigin(CommandSource.Telegram, userName, message.ChatId, update.UpdateId);

        var reply = message switch
        {
            { Text: { } text } when text.StartsWith('/') => await SlashAsync(text, botUsername, origin, ct),
            { Text: { } text } => await TextAsync(text, origin with { IgnoreUnrecognized = message.IsGroup }, ct),
            { HasVoice: true } => VoiceNotYet,
            _ => null, // stickers, photos, joins…
        };

        if (reply is not null)
        {
            await gateway.SendMessageAsync(message.ChatId, reply, message.IsGroup ? message.MessageId : null, ct);
        }
    }

    private async Task<string?> TextAsync(string text, CommandOrigin origin, CancellationToken ct)
    {
        var response = await commands.HandleTextAsync(text, origin, ct);
        return response.CommandId == Guid.Empty ? null : ReplyFormatter.ForTelegram(response); // empty: group chatter
    }

    private async Task<string?> SlashAsync(string text, string botUsername, CommandOrigin origin, CancellationToken ct)
    {
        var space = text.IndexOfAny([' ', '\n']);
        var command = (space < 0 ? text[1..] : text[1..space]).ToLowerInvariant();
        var args = space < 0 ? "" : text[(space + 1)..].Trim();

        if (command.Split('@', 2) is [var name, var target])
        {
            if (!string.Equals(target, botUsername, StringComparison.OrdinalIgnoreCase))
            {
                return null; // addressed to another bot in the group
            }

            command = name;
        }

        CommandResponse response;
        switch (command)
        {
            case "start" or "help":
                return Help;
            case "list":
                response = await commands.HandleCommandsAsync(text, [new GetList(OrDefault(args))], origin, ct);
                break;
            case "lists":
                response = await commands.HandleCommandsAsync(text, [new GetLists()], origin, ct);
                break;
            case "add" when args.Length == 0:
                return "What should I add? For example: /add milk, eggs";
            case "add":
                response = await commands.HandleTextAsync($"add {args}", origin, ct);
                break;
            case "done" when args.Length == 0:
                return "What should I check off? For example: /done milk";
            case "done":
                response = await commands.HandleTextAsync($"check off {args}", origin, ct);
                break;
            case "clear":
                response = await commands.HandleCommandsAsync(text, [new ClearList(OrDefault(args), CompletedOnly: true)], origin, ct);
                break;
            case "undo":
                response = await commands.UndoLastAsync(origin, ct);
                break;
            default:
                return $"I don't know /{ReplyFormatter.Html(command)}. Send /help to see what I understand.";
        }

        return ReplyFormatter.ForTelegram(response);
    }

    /// <summary>"/list" means the default list; a name goes to the same resolver as speech (slug, name, alias, fuzzy).</summary>
    private static string? OrDefault(string args) => args.Length == 0 ? null : args;
}
