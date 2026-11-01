# Home Kiosk Backend: Development Spec

**Status:** Draft v1 (Oct 31, 2026)
**Scope:** Backend only. A separate model/agent is building the front end. Section 5 (Front-end contract) is the shared interface between the two. Don't change it without updating this document and telling the front-end side.

---

## 1. What we're building

An always-on Android tablet in kiosk mode shows household lists, starting with a grocery list. People change those lists in three ways:

1. **Push-to-talk on the tablet.** The front end records a short clip and POSTs it to the backend. The backend transcribes it locally, works out the intent, applies it, and returns a reply.
2. **Telegram.** Family members message a private bot ("add eggs", "what's on the grocery list?"). The bot applies the change and replies. Voice notes to the bot work too.
3. **Direct taps on the kiosk UI**, such as checking an item off. These go through plain REST calls.

Every change is pushed to the tablet in real time over SignalR.

**Core design rule: everything becomes text and goes through one command pipeline.** Voice gets transcribed to text. Telegram text is already text, and Telegram voice notes get transcribed. All of it ends up at the same `CommandParser` → `CommandExecutor` path, so a phrase behaves the same no matter where it came from.

```
Tablet (push-to-talk) ──audio──▶ Speech-to-text ──text──┐
Telegram voice note ────audio──▶ Speech-to-text ──text──┤
Telegram text message ─────────────────────────── text──┼──▶ Command parser ──▶ Command executor ──▶ SQLite
POST /api/commands (typed/test) ───────────────── text──┘                              │
                                                                                         ├──▶ SignalR → tablet
                                                                                         └──▶ Reply → Telegram / HTTP response
```

### Goals (v1)
- Push-to-talk voice commands with transcription done locally (no cloud speech service).
- Telegram bot for adding to lists and reading them back.
- Live updates on the kiosk.
- Runs on a small always-on box in the house (Linux x64 mini PC). Also runs on a Windows dev machine.

### Non-goals (v1)
Wake word, text-to-speech, user accounts, multiple households, categories or aisle sorting, recurring items, SMS.

---

## 2. Decisions and assumptions

| Area | Decision | Notes |
|---|---|---|
| Runtime | **.NET 10 (LTS)**, ASP.NET Core minimal APIs | |
| Real-time | **ASP.NET Core SignalR** | Front end uses `@microsoft/signalr` |
| Database | **SQLite** via EF Core | WAL mode; file at `/data/kiosk.db` |
| Speech-to-text | **NVIDIA Parakeet TDT 0.6B v3 (int8)** via **sherpa-onnx** (`org.k2fsa.sherpa.onnx` NuGet) | CPU-only is fine. Placed behind `ISpeechToText` so Whisper.net can be swapped in |
| Audio conversion | **ffmpeg** (process call) for anything that isn't 16 kHz mono WAV | Needed for Telegram voice notes (OGG/Opus) |
| Intent parsing | **Rules first, LLM fallback**, behind `ICommandParser` | The LLM goes through `Microsoft.Extensions.AI` `IChatClient`. Default provider: official `Anthropic` C# SDK, model configurable |
| Messaging | **Telegram Bot API** via `Telegram.BotAPI` NuGet, **long polling** by default | Long polling needs no inbound port or public URL. Webhook mode is an option for cloud hosting |
| Hosting | **Local mini PC, Docker Compose, Caddy** for HTTPS | The tablet microphone only works over HTTPS (or localhost) |
| IDs | `Guid.CreateVersion7()` | Sortable by creation time |
| API docs | Built-in `Microsoft.AspNetCore.OpenApi` + Scalar UI | Give `/openapi/v1.json` to the front-end model |

**Assumptions to confirm** (see section 16): one kiosk; English only; starter lists "Grocery" (default) and "To-do".

---

## 3. Solution layout

```
HomeKiosk.sln
├─ src/
│  ├─ HomeKiosk.Api/              # Host: endpoints, SignalR hub, hosted services, DI, auth
│  │  ├─ Endpoints/               # ListEndpoints, ItemEndpoints, CommandEndpoints, VoiceEndpoints, HealthEndpoints
│  │  ├─ Hubs/KioskHub.cs
│  │  ├─ Auth/KioskKeyAuthHandler.cs
│  │  └─ Program.cs
│  ├─ HomeKiosk.Core/             # Domain + application logic; no infrastructure references
│  │  ├─ Domain/                  # KioskList, ListItem, CommandLog, enums
│  │  ├─ Commands/                # ListCommand records, ICommandParser, RuleBasedCommandParser,
│  │  │                           # CompositeCommandParser, CommandExecutor, ReplyFormatter
│  │  ├─ Matching/                # Text normalization, list/item resolution, fuzzy matching
│  │  └─ Abstractions/            # ISpeechToText, IAudioDecoder, IListNotifier, IClock
│  └─ HomeKiosk.Infrastructure/
│     ├─ Persistence/             # KioskDbContext, migrations, seed, backup service
│     ├─ Speech/                  # ParakeetSpeechToText, (optional) WhisperNetSpeechToText,
│     │                           # WavDecoder, FfmpegAudioDecoder, SttWarmupService
│     ├─ Llm/                     # LlmCommandParser (IChatClient-based)
│     ├─ Telegram/                # TelegramPollingService, TelegramWebhookEndpoint,
│     │                           # TelegramUpdateHandler, ITelegramGateway
│     └─ Notifications/           # SignalRListNotifier
├─ tests/
│  ├─ HomeKiosk.Core.Tests/       # Parser + executor tests (table-driven)
│  └─ HomeKiosk.Api.Tests/        # WebApplicationFactory API/contract tests, STT integration (opt-in)
├─ models/                        # Parakeet model files (git-ignored); see section 8
├─ scripts/download-models.sh / .ps1
├─ deploy/docker-compose.yml, Caddyfile, Dockerfile
└─ docs/kiosk-backend-spec.md     # this file
```

No MediatR. Plain interfaces plus DI are enough at this size.

---

## 4. Domain model

```csharp
public sealed class KioskList
{
    public Guid Id { get; set; }                 // v7
    public string Name { get; set; } = "";       // "Grocery"
    public string Slug { get; set; } = "";       // "grocery" (unique)
    public List<string> Aliases { get; set; } = []; // ["groceries", "food", "store"] — stored as JSON
    public bool IsDefault { get; set; }          // exactly one list is default
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }   // soft delete
    public List<ListItem> Items { get; set; } = [];
}

public sealed class ListItem
{
    public Guid Id { get; set; }
    public Guid ListId { get; set; }
    public string Text { get; set; } = "";           // display text, e.g. "Milk"
    public string NormalizedText { get; set; } = ""; // "milk" (dedupe + matching)
    public string? Quantity { get; set; }            // free text: "2 gallons"
    public bool IsCompleted { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? AddedBy { get; set; }             // "Kiosk", or Telegram allowlist name
    public CommandSource Source { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }   // soft delete (enables undo)
    public Guid? LastCommandId { get; set; }         // the command that last changed this item
}

public enum CommandSource { Kiosk, Voice, Telegram, TelegramVoice, Api }

public sealed class CommandLog
{
    public Guid Id { get; set; }
    public CommandSource Source { get; set; }
    public string? RawText { get; set; }             // typed text, or transcript for voice
    public int? AudioDurationMs { get; set; }
    public string Parser { get; set; } = "";         // "rules" | "llm" | "none"
    public string ActionsJson { get; set; } = "[]";  // serialized parsed actions + per-action status
    public string Reply { get; set; } = "";
    public bool Understood { get; set; }
    public string? Error { get; set; }
    public string? UserName { get; set; }
    public long? TelegramChatId { get; set; }
    public long? TelegramUpdateId { get; set; }      // unique index → dedupe redelivered updates
    public int SttMs { get; set; }
    public int ParseMs { get; set; }
    public int TotalMs { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public bool Undone { get; set; }
}
```

**Normalization** (`TextNormalizer.Normalize`): lowercase, trim, collapse whitespace, strip trailing punctuation, strip leading filler ("a", "an", "some", "the", "more"). Item **display** text is the cleaned phrase with its first letter capitalized.

**Dedupe:** adding an item whose `NormalizedText` matches an *open* item on the same list does not create a duplicate. The reply says it's already on the list. If the match is a *completed* item, it is reopened.

**Seed data:** Grocery (default; aliases: groceries, food, store, shopping) and To-do (aliases: todo, to do, chores).

---

## 5. Front-end contract (share this section with the front-end model)

### 5.1 Base and auth
- Base URL: same origin as the front end when possible. Recommended: the backend serves the built front end from `wwwroot/`, which avoids CORS. If they're served separately, set the allowed origin in `Cors:AllowedOrigins`.
- Every REST call sends header `X-Kiosk-Key: <key>`.
- SignalR sends the same key via `accessTokenFactory` (it arrives as the `access_token` query string). The server accepts either.
- Errors are RFC 9457 `ProblemDetails` JSON.

### 5.2 DTOs

```jsonc
// ListSummary
{ "id": "0193…", "slug": "grocery", "name": "Grocery", "isDefault": true, "openCount": 4, "completedCount": 2 }

// ListDetail
{
  "id": "0193…", "slug": "grocery", "name": "Grocery", "isDefault": true,
  "items": [ /* ItemDto[], open items first (oldest first), then completed (most recent first) */ ]
}

// ItemDto
{
  "id": "0193…", "listId": "0193…", "text": "Milk", "quantity": "2 gallons",
  "isCompleted": false, "completedAt": null,
  "addedBy": "Kiosk", "source": "voice",   // kiosk | voice | telegram | telegramVoice | api
  "createdAt": "2026-10-31T20:15:00Z"
}

// CommandResponse (returned by /api/commands, /api/voice, /api/undo; also broadcast over SignalR)
{
  "commandId": "0193…",
  "source": "voice",
  "transcript": "Add milk and eggs to the grocery list.",   // null for typed commands
  "understood": true,
  "actions": [
    { "type": "addItems", "list": "grocery", "items": ["Milk", "Eggs"], "status": "applied" }
    // type: addItems | removeItems | completeItems | getList | getLists | clearList | createList | undo
    // status: applied | noChange | notFound | ambiguous | failed
  ],
  "reply": "Added milk and eggs to Grocery.",
  "list": { /* ListDetail of the main affected list, or null */ },
  "addedBy": "Kiosk",
  "timings": { "sttMs": 420, "parseMs": 35, "totalMs": 510 }
}
```

### 5.3 REST endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | `{ status, stt: "loading"\|"ready"\|"error", telegram: "disabled"\|"connected"\|"error", version }` (no auth required) |
| GET | `/api/lists` | — | `ListSummary[]` |
| POST | `/api/lists` | `{ name, aliases? }` | 201 `ListSummary` |
| PATCH | `/api/lists/{slug}` | `{ name?, aliases?, isDefault? }` | `ListSummary` |
| DELETE | `/api/lists/{slug}` | — | 204 (soft delete; the default list can't be deleted) |
| GET | `/api/lists/{slug}?includeCompleted=true` | — | `ListDetail` |
| POST | `/api/lists/{slug}/items` | `{ text, quantity? }` | 201 `ItemDto`, or 200 with the existing item if it's a duplicate |
| PATCH | `/api/items/{id}` | `{ text?, quantity?, isCompleted? }` | `ItemDto` |
| DELETE | `/api/items/{id}` | — | 204 (soft delete) |
| POST | `/api/lists/{slug}/clear` | `{ completedOnly: true }` | `ListDetail` |
| POST | `/api/commands` | `{ text }` | `CommandResponse` |
| POST | `/api/voice` | `multipart/form-data`, field `audio` | `CommandResponse` |
| POST | `/api/undo` | — | `CommandResponse` (reverts the most recent not-yet-undone command) |
| GET | `/api/commands/recent?take=20` | — | recent `CommandLog` summaries (for a debug/history panel) |

Every write, whether it comes from REST, voice, or Telegram, triggers the SignalR events below.

### 5.4 Audio upload rules (`POST /api/voice`)
- **Preferred format:** `audio/wav`, **16 kHz, mono, 16-bit PCM**. The front end can capture PCM with the Web Audio API (AudioWorklet), downsample to 16 kHz, and wrap it in a WAV header. This path skips ffmpeg and is fastest.
- **Also accepted:** `audio/webm` (Opus), `audio/ogg` (Opus), `audio/mp4`. These are converted server-side with ffmpeg.
- Limits: **max 30 s, max 2 MB** (413 if exceeded). A clip shorter than 0.3 s, or an empty transcript, returns 200 with `understood: false` and `reply: "I didn't catch that."`
- Returns **503** with `ProblemDetails` while the STT model is still loading (see `/api/health`).
- Expected latency on the target box: under 1 s of STT for a 3–5 s clip. LLM fallback adds about 0.5–1.5 s.

### 5.5 SignalR
- Hub URL: `/hubs/kiosk`. Use `withAutomaticReconnect()`.
- **Server → client events:**
  - `ListChanged(ListDetail list)`: full snapshot of a list after any change. Lists are small, so no diffs.
  - `ListsChanged(ListSummary[] lists)`: a list was created, renamed, deleted, or had its default changed.
  - `CommandProcessed(CommandResponse response)`: sent for every command from any source. Lets the kiosk show a toast like "Added eggs (via Telegram)".
- No client → server methods in v1. All writes go through REST.
- After a reconnect, the client should re-fetch `GET /api/lists` and the visible list. Events missed while disconnected are not replayed.

### 5.6 Mic requirement (front-end note)
`getUserMedia` only works in a secure context. The kiosk must load the app over **HTTPS** (section 12) or from `localhost`. Most Android kiosk browsers are WebView-based and don't support the browser `SpeechRecognition` API, so the front end must not use it. Send audio to `/api/voice` instead.

---

## 6. Command model and pipeline

### 6.1 Commands

```csharp
public abstract record ListCommand;
public sealed record AddItems(string? List, IReadOnlyList<ItemSpec> Items) : ListCommand;
public sealed record RemoveItems(string? List, IReadOnlyList<string> Items) : ListCommand;
public sealed record CompleteItems(string? List, IReadOnlyList<string> Items) : ListCommand;
public sealed record GetList(string? List) : ListCommand;
public sealed record GetLists : ListCommand;
public sealed record ClearList(string? List, bool CompletedOnly) : ListCommand;
public sealed record CreateList(string Name) : ListCommand;
public sealed record Undo : ListCommand;
public sealed record Unrecognized(string Reason) : ListCommand;

public sealed record ItemSpec(string Text, string? Quantity = null);

public sealed record ParseResult(IReadOnlyList<ListCommand> Commands, string Parser); // "rules" | "llm" | "none"
```

A single utterance can yield several commands ("add milk and check off bread").

### 6.2 Interfaces

```csharp
public interface ICommandParser
{
    Task<ParseResult> ParseAsync(string text, ParseContext context, CancellationToken ct);
}

// Context gives parsers what they need to resolve references
public sealed record ParseContext(
    IReadOnlyList<ListSummaryWithAliases> Lists,
    string DefaultListSlug,
    IReadOnlyDictionary<string, IReadOnlyList<string>> OpenItemsByList, // for "check off the milk"
    CommandSource Source,
    DateTimeOffset Now);

public interface ICommandService   // orchestrates: parse → execute → log → notify
{
    Task<CommandResponse> HandleTextAsync(string text, CommandOrigin origin, CancellationToken ct);
    Task<CommandResponse> HandleAudioAsync(Stream audio, string contentType, CommandOrigin origin, CancellationToken ct);
    Task<CommandResponse> UndoLastAsync(CommandOrigin origin, CancellationToken ct);
}

public sealed record CommandOrigin(CommandSource Source, string? UserName, long? TelegramChatId = null, long? TelegramUpdateId = null);
```

### 6.3 Parsers
- **`RuleBasedCommandParser`**: compiled regexes for the common phrasings in the table in 6.6. Fast and free. Returns `Unrecognized` when nothing matches. Item lists split on commas, "and", and "&". Leading filler ("please", "can you", "hey") is stripped.
- **`LlmCommandParser`**: uses `IChatClient` (Microsoft.Extensions.AI) with **tool definitions** that mirror the command records (`add_items`, `remove_items`, `complete_items`, `get_list`, `get_lists`, `clear_list`, `create_list`, `undo`). Do **not** enable automatic function invocation. Read the `FunctionCallContent` items from the response and map them to `ListCommand`s. The LLM proposes actions and our code executes them. Temperature 0, timeout 6 s. Only text is sent to the LLM, never audio.
- **`CompositeCommandParser`** (`Parsing:Strategy`):
  - `RulesThenLlm` (**default**): try rules; if the result is `Unrecognized`, ask the LLM.
  - `Rules`: rules only (no LLM configured or wanted).
  - `LlmThenRules`: LLM first; fall back to rules on timeout or error.
- **Output validation:** at most 25 items per command; item text at most 100 characters; unknown tool names are ignored; anything malformed becomes `Unrecognized`.

**LLM system prompt (starting point):**
```
You turn short household voice or text commands into list actions by calling tools.
Lists (slug: name [aliases]): {lists}
Default list: {defaultSlug}. Use it when the user doesn't name a list.
Open items per list: {openItems}
Rules:
- Split multiple items into separate entries. Keep item text short and plain ("milk", not "some milk").
- Put amounts in "quantity" ("2 gallons").
- "We're out of X" / "we need X" means add X.
- "Got X" / "bought X" / "check off X" means complete X.
- If the user names a list that doesn't exist, pass the name they said; the server handles it.
- If the request isn't about lists, call no tools.
Transcripts may contain speech-recognition errors; choose the most plausible list/item.
```

**Model config:** `Llm:Provider = "Anthropic"`, `Llm:Model = "claude-haiku-5-5"` (small and fast is right for this job). Because `IChatClient` is used, a local model (for example an OpenAI-compatible local server) can be dropped in later with no parser changes. Package: `Anthropic` on NuGet (v10+ is the official SDK; check its docs for the `IChatClient` adapter).

### 6.4 Executor (`CommandExecutor`)
- Applies every command from one utterance in a **single DB transaction** and stamps `LastCommandId` on the items it touches.
- **List resolution:** `null` → default list; otherwise match by slug, name, or alias (case-insensitive), then fuzzy (Levenshtein ≤ 2 on the normalized name) to absorb STT spelling errors. An unknown list does **not** auto-create. The reply is: *"I don't have a list called Camping. Say 'create a list called Camping' to add it."*
- **Item resolution** (remove/complete): exact normalized match → singular/plural match → contains → fuzzy. If more than one candidate matches, the action status is `ambiguous` and the reply names the candidates.
- **Undo:** reverts the most recent `CommandLog` that isn't undone and had write actions: restores soft-deleted items, un-completes completed items, soft-deletes added items. Sets `Undone = true`. Undo applies only to the most recent action (no multi-step history).
- After commit, writes the `CommandLog`, then publishes through `IListNotifier`: `ListChanged` per affected list, `ListsChanged` if lists changed, and `CommandProcessed` always.

### 6.5 Reply formatting (`ReplyFormatter`)
- Kiosk/HTTP: one short sentence. *"Added milk and eggs to Grocery."* / *"Milk is already on Grocery."* / *"Checked off bread."*
- `GetList` for HTTP: *"Grocery has 4 items: milk, eggs, bread, coffee."*
- `GetList` for Telegram: multi-line HTML with a bold list name, a bullet per open item, and the quantity in parentheses.
- Unrecognized: *"I didn't catch that. Try 'add milk to the grocery list'."*

### 6.6 Acceptance phrase table (use as table-driven tests)

| Input | Expected parse | Parser |
|---|---|---|
| add milk to the grocery list | AddItems(grocery, [milk]) | rules |
| add milk, eggs and bread | AddItems(default, [milk, eggs, bread]) | rules |
| put two gallons of milk on the list | AddItems(default, [{milk, "two gallons"}]) | rules or llm |
| add drill bits to hardware | AddItems(hardware → not found reply) | rules |
| we're out of coffee | AddItems(default, [coffee]) | llm |
| we need paper towels and dish soap | AddItems(default, [paper towels, dish soap]) | llm |
| what's on the grocery list | GetList(grocery) | rules |
| read me the list | GetList(default) | rules |
| what lists do we have | GetLists | rules |
| remove bananas | RemoveItems(default, [bananas]) | rules |
| take bananas off groceries | RemoveItems(grocery, [bananas]) | rules |
| check off eggs / I got the eggs | CompleteItems(default, [eggs]) | rules / llm |
| clear completed | ClearList(default, completedOnly: true) | rules |
| clear the grocery list | ClearList(grocery, completedOnly: false) | rules |
| create a list called camping | CreateList(Camping) | rules |
| undo / never mind, undo that | Undo | rules |
| add milk and check off bread | AddItems(default,[milk]) + CompleteItems(default,[bread]) | llm |
| "" / "um" | Unrecognized | none |
| what's the weather | Unrecognized | llm (no tools) |

---

## 7. Command service flow

```
HandleAudioAsync(stream, contentType, origin)
  1. Enforce size limit → 413
  2. IAudioDecoder: WAV 16k mono PCM16 → parse directly; else ffmpeg → float[] @16k mono
  3. Duration > 30 s → 413; < 0.3 s → Unrecognized response
  4. ISpeechToText.TranscribeAsync(samples) → transcript (+ sttMs)
  5. → HandleTextAsync(transcript, origin) with transcript attached

HandleTextAsync(text, origin)
  1. If origin.TelegramUpdateId already in CommandLog → return the stored response (idempotent)
  2. Build ParseContext from DB
  3. CompositeCommandParser.ParseAsync
  4. CommandExecutor.ExecuteAsync (transaction)
  5. ReplyFormatter → reply
  6. Persist CommandLog; notify via SignalR; return CommandResponse
```

---

## 8. Speech-to-text

### 8.1 Model
- **Parakeet TDT 0.6B v3, int8 sherpa-onnx export:**
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`
- Files used: `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt` (about 640 MB unpacked).
- `scripts/download-models.(sh|ps1)` downloads and extracts to `models/parakeet-tdt-0.6b-v3-int8/`. The model is git-ignored, mounted as a Docker volume, and its path set by `Stt:ModelPath`.
- License: CC-BY-4.0 (NVIDIA). Credit it in the README.
- **Known quirk:** some users report the upstream int8 *encoder* occasionally returns no tokens on certain inputs. If empty transcripts show up on clearly spoken clips, try the fp32 export (`sherpa-onnx-nemo-parakeet-tdt-0.6b-v3`). Log every empty transcript along with the audio duration so this can be spotted.

### 8.2 Implementation sketch (verify names against sherpa-onnx `dotnet-examples/offline-decode-files`)

```csharp
public sealed class ParakeetSpeechToText : ISpeechToText, IDisposable
{
    private readonly OfflineRecognizer _recognizer;
    private readonly SemaphoreSlim _gate = new(1, 1);   // serialize decodes; one kiosk + occasional Telegram voice

    public ParakeetSpeechToText(IOptions<SttOptions> opt)
    {
        var dir = opt.Value.ModelPath;
        var config = new OfflineRecognizerConfig();
        config.FeatConfig.SampleRate = 16000;
        config.FeatConfig.FeatureDim = 80;
        config.ModelConfig.Transducer.Encoder = Path.Combine(dir, "encoder.int8.onnx");
        config.ModelConfig.Transducer.Decoder = Path.Combine(dir, "decoder.int8.onnx");
        config.ModelConfig.Transducer.Joiner  = Path.Combine(dir, "joiner.int8.onnx");
        config.ModelConfig.Tokens = Path.Combine(dir, "tokens.txt");
        config.ModelConfig.ModelType = "nemo_transducer";
        config.ModelConfig.NumThreads = opt.Value.NumThreads;     // default 4
        config.DecodingMethod = "greedy_search";
        _recognizer = new OfflineRecognizer(config);
    }

    public async Task<SttResult> TranscribeAsync(float[] samples16kMono, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var sw = Stopwatch.StartNew();
            using var stream = _recognizer.CreateStream();
            stream.AcceptWaveform(16000, samples16kMono);
            _recognizer.Decode(stream);
            return new SttResult(stream.Result.Text.Trim(), (int)sw.ElapsedMilliseconds);
        }
        finally { _gate.Release(); }
    }
}
```

- Register as a **singleton**. Load it in `SttWarmupService` (a hosted service) at startup and decode 1 s of silence to warm it up. `IsReady` drives `/api/health` and the 503 response.
- Packages: `org.k2fsa.sherpa.onnx` (plus the runtime package for the RID: `linux-x64` in Docker, `win-x64` for dev). Publish with `-r linux-x64`.
- Parakeet outputs punctuation and casing. The parsers must tolerate trailing periods and commas.
- **Alternative implementation** (optional, for A/B comparison): `WhisperNetSpeechToText` using `Whisper.net` + `Whisper.net.Runtime` (or `.AllRuntimes`) with a `ggml-base.en` or `small.en` model. Select with `Stt:Engine = Parakeet | Whisper`.

### 8.3 Audio decoding (`IAudioDecoder`)
- `WavDecoder`: hand-rolled RIFF parser for PCM16 mono 16 kHz. Fast path, no dependencies. If the WAV is a different rate or channel count, hand it to ffmpeg.
- `FfmpegAudioDecoder`: `ffmpeg -hide_banner -loglevel error -i pipe:0 -ac 1 -ar 16000 -f s16le pipe:1`, then convert the s16le bytes to `float[]` (÷ 32768f). 10 s timeout. Requires ffmpeg on PATH (installed in the Docker image; `winget install ffmpeg` for dev).

### 8.4 Privacy
Audio is **not** stored by default. `Stt:SaveAudioForDebug = true` writes clips to `/data/audio/` with 7-day retention, for tuning only.

---

## 9. Telegram bot

### 9.1 Setup
1. Create the bot with **@BotFather** and copy the token into config `Telegram:BotToken` (env var / user-secrets; never committed).
2. To use the bot in a **family group chat** and have it see ordinary (non-command) messages, turn **privacy mode off** in BotFather (`/setprivacy` → Disable), or make the bot a group admin. Otherwise it only receives `/commands` and @mentions.

### 9.2 Service
- Package: **`Telegram.BotAPI`** (v10.x, Bot API 10.2).
- `Telegram:Mode = Polling` (default) → `TelegramPollingService : BackgroundService`:
  - On start: `deleteWebhook`, then `setMyCommands`, then loop `GetUpdatesAsync(offset, timeout: 30, allowedUpdates: ["message", "callback_query"])`.
  - Advance `offset = lastUpdateId + 1`. Handle each update in a try/catch so one bad update can't kill the loop. Exponential backoff on network errors (1 s → 60 s cap). Health shows `telegram: "error"` while backing off.
- `Telegram:Mode = Webhook` (cloud hosting): `POST /api/telegram/webhook`. Validate the `X-Telegram-Bot-Api-Secret-Token` header against `Telegram:WebhookSecret`. Register with `setWebhook` on startup.
- All Telegram API calls go through a thin `ITelegramGateway` so handlers can be unit-tested with a fake.

### 9.3 Authorization
- Allowlist in config: `Telegram:AllowedChats: [{ "chatId": 123456789, "name": "Matt" }, { "chatId": -100987654321, "name": "Family group" }]`.
- In a group, `AddedBy` uses the **sender's** first name; allowlisting the group's chat ID is enough.
- A chat that isn't on the allowlist gets one reply: *"This bot is private. Your chat ID is 123456789. Ask the admin to add it."* Nothing else happens, and the attempt is logged.

### 9.4 Message handling
| Input | Behavior |
|---|---|
| Free text | `ICommandService.HandleTextAsync(text, origin: Telegram)` → reply with `response.reply` |
| `/list [name]` | GetList → formatted list (+ inline buttons, see below) |
| `/lists` | GetLists |
| `/add <items>` | Same as "add <items>" |
| `/done <item>` | CompleteItems |
| `/clear [name]` | ClearList completedOnly=true (say "clear the X list" for a full clear) |
| `/undo` | Undo |
| `/help` | Usage examples |
| Voice note | `getFile` → download `https://api.telegram.org/file/bot<token>/<file_path>` → `HandleAudioAsync(stream, "audio/ogg", origin: TelegramVoice)`. Reply starts with *Heard: "…"* |

- Replies use `parse_mode = HTML`. **Escape `&`, `<`, `>`** in item text.
- **Inline check-off (M5):** a list reply includes one button per open item (`✓ Milk`) with `callback_data = "done:{itemId:N}"` (34 bytes, under Telegram's 64-byte limit). On `callback_query`: complete the item, `answerCallbackQuery`, and edit the message with the refreshed list.
- Optional `Telegram:NotifyChatId`: when set, changes made on the kiosk are announced to that chat ("Kiosk added eggs to Grocery"). Default off.

---

## 10. Configuration

`appsettings.json` (secrets come from environment variables or user-secrets):

```jsonc
{
  "ConnectionStrings": { "Kiosk": "Data Source=/data/kiosk.db" },
  "Kiosk": {
    "ApiKey": "",                       // env: Kiosk__ApiKey
    "TimeZone": "America/New_York"
  },
  "Cors": { "AllowedOrigins": [] },     // empty when the front end is served from wwwroot
  "Stt": {
    "Engine": "Parakeet",               // Parakeet | Whisper
    "ModelPath": "/models/parakeet-tdt-0.6b-v3-int8",
    "NumThreads": 4,
    "MaxSeconds": 30,
    "MaxUploadBytes": 2097152,
    "SaveAudioForDebug": false
  },
  "Parsing": { "Strategy": "RulesThenLlm" },  // Rules | RulesThenLlm | LlmThenRules
  "Llm": {
    "Provider": "Anthropic",
    "Model": "claude-haiku-5-5",
    "ApiKey": "",                       // env: Llm__ApiKey
    "TimeoutSeconds": 6
  },
  "Telegram": {
    "Enabled": true,
    "Mode": "Polling",                  // Polling | Webhook
    "BotToken": "",                     // env: Telegram__BotToken
    "WebhookSecret": "",
    "AllowedChats": [],
    "NotifyChatId": null
  },
  "Backup": { "Enabled": true, "Directory": "/data/backups", "KeepDays": 14 }
}
```

Validate options at startup (`ValidateOnStart`). The app should **start even if Telegram or the LLM is misconfigured**: it disables that feature, logs a warning, and reports it in `/api/health`.

---

## 11. Persistence
- EF Core with SQLite. Enable WAL (`PRAGMA journal_mode=WAL;` on connection open). Store `Aliases` as a JSON column.
- Global query filters exclude soft-deleted rows. Undo uses `IgnoreQueryFilters()`.
- Run migrations on startup (`Database.MigrateAsync()`). It's a single-instance app, so this is safe.
- `BackupService` (hosted, daily at 3 AM local): `VACUUM INTO '/data/backups/kiosk-yyyyMMdd.db'`, delete files older than `KeepDays`.
- Indexes: `ListItem(ListId, IsCompleted)`, `ListItem(ListId, NormalizedText)`, unique `KioskList(Slug)`, unique filtered `CommandLog(TelegramUpdateId)`.

---

## 12. Security and HTTPS
- **HTTPS is required for the kiosk mic.** Local options:
  - **Caddy** in front of the app with a real domain (`kiosk.example.com` → LAN IP in DNS) and a certificate issued by **DNS challenge** (no ports opened to the internet). **(Recommended)**
  - **Tailscale** on the box and the tablet, with `tailscale cert` for the `*.ts.net` name.
- Kiosk API key: random 32+ bytes. Compare in constant time (`CryptographicOperations.FixedTimeEquals`). Store it in the kiosk browser's start URL or local storage, whichever the front end decides.
- No inbound internet exposure is needed in Polling mode. Bind to the LAN only.
- Rate limiting (built-in `RateLimiter`): `/api/voice` and `/api/commands`, 30 requests/min fixed window.
- Request size limits: 2 MB on `/api/voice`, 16 KB on JSON endpoints.
- Never log the bot token, API keys, or the kiosk key.

---

## 13. Hosting and deployment

**Target:** small Linux x64 mini PC (4+ cores, 8 GB RAM is plenty), Docker Compose.

```yaml
# deploy/docker-compose.yml (sketch)
services:
  api:
    build: { context: .., dockerfile: deploy/Dockerfile }
    restart: unless-stopped
    environment:
      - Kiosk__ApiKey=${KIOSK_API_KEY}
      - Telegram__BotToken=${TELEGRAM_BOT_TOKEN}
      - Llm__ApiKey=${LLM_API_KEY}
    volumes:
      - kiosk-data:/data
      - ./models:/models:ro
  caddy:
    image: caddy:2   # use a build with the DNS provider plugin for DNS-challenge certs
    restart: unless-stopped
    ports: ["443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, caddy-data:/data]
volumes: { kiosk-data: {}, caddy-data: {} }
```

- `Dockerfile`: multi-stage, build on `mcr.microsoft.com/dotnet/sdk:10.0`, run on `mcr.microsoft.com/dotnet/aspnet:10.0`, plus `apt-get install -y ffmpeg`. `dotnet publish -r linux-x64`. Make sure the sherpa-onnx native `.so` files land in the publish output.
- Caddy reverse-proxies to `api:8080`. SignalR WebSockets pass through Caddy with no extra config.
- **Dev on Windows:** `dotnet run` with the model in `./models`, ffmpeg via winget, and the kiosk key, bot token, and LLM key in user-secrets. Run the front end against `https://localhost:xxxx`. Localhost counts as a secure context, so the mic works in desktop Chrome.
- **Cloud alternative** (if chosen later): Azure Container Apps or App Service (Linux, at least 2 GB RAM for the model), `Telegram:Mode = Webhook`, SQLite on Azure Files or a switch to Postgres. HTTPS comes free.

---

## 14. Observability
- **Serilog**: console + rolling file (`/data/logs`, 14 days). One structured log event per command with source, parser, actions, timings, and `understood`.
- `/api/health` as specified in 5.3.
- `GET /api/commands/recent` makes it easy to see which phrases fall through to the LLM or fail. Use it to grow the rule set over time.

---

## 15. Build order (milestones)

Each milestone ends with its acceptance check passing and tests green.

**M1: Skeleton and lists**
Solution and projects, EF Core + SQLite + migrations + seed, list/item REST endpoints, SignalR hub + `SignalRListNotifier`, kiosk key auth, `/api/health`, OpenAPI + Scalar, Serilog.
✅ The front end can load lists, add/check/delete items over REST, and a second browser tab updates live.

**M2: Command pipeline (rules)**
Command records, `TextNormalizer`, list/item resolution with fuzzy matching, `RuleBasedCommandParser`, `CommandExecutor` (transactional), `ReplyFormatter`, `CommandLog`, `/api/commands`, `/api/undo`, `CommandProcessed` event.
✅ Every "rules" row in table 6.6 passes as a unit test, and `POST /api/commands {"text":"add milk to the grocery list"}` updates the kiosk live.

**M3: Speech-to-text**
Model download scripts, `ParakeetSpeechToText`, `SttWarmupService`, `WavDecoder`, `FfmpegAudioDecoder`, `/api/voice`, limits, 503-while-loading.
✅ WAV fixtures in `tests/fixtures/` ("add milk to the grocery list", "what's on the grocery list") transcribe and apply correctly. A 4 s clip finishes STT in under 1.5 s on the target box. This integration test is opt-in (`[Trait("Category","RequiresModel")]`).

**M4: Telegram (text)**
`ITelegramGateway`, polling service, allowlist, slash commands, HTML replies, update-ID dedupe, health status.
✅ An allowed phone sends "add eggs" and the kiosk updates within a second and the bot replies. A non-allowlisted chat is rejected with its chat ID.

**M5: Smarter parsing and Telegram extras**
`LlmCommandParser` via `IChatClient` + `CompositeCommandParser`, Telegram voice notes, inline check-off buttons, optional kiosk→Telegram notifications.
✅ Every "llm" row in table 6.6 passes (integration test, opt-in, needs an API key). Sending a voice note "we're out of coffee" adds Coffee.

**M6: Deploy**
Dockerfile, compose, Caddy with DNS-challenge cert, backups, README (setup, BotFather steps, model download, env vars, CC-BY credit).
✅ The tablet loads the app over HTTPS from the mini PC, the mic works, and everything survives a reboot (`restart: unless-stopped`).

---

## 16. Open questions (defaults in parentheses)

1. **Hosting:** local mini PC or Azure? (Local. The spec supports both through `Telegram:Mode`.)
2. **LLM fallback:** OK to send command *text* (never audio) to a hosted LLM? Or rules-only, or a local model later? (Hosted, Haiku-class; can switch to `Rules` with one setting.)
3. **Starting lists and default:** (Grocery default, To-do.)
4. **Who's on the Telegram allowlist, and DMs or a family group?** (Both supported.)
5. **Should the kiosk speak replies?** (Not in v1. `reply` text is returned for display. TTS could be added later behind an `ITextToSpeech` endpoint.)
6. **Quantities:** keep free text, or parse into number + unit? (Free text.)
7. **More than one kiosk?** (Assumed one. Nothing in the design prevents more.)

---

## 17. References
- sherpa-onnx NeMo transducer models (Parakeet v3 int8): https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html
- sherpa-onnx C# examples: https://github.com/k2-fsa/sherpa-onnx/tree/master/dotnet-examples
- NVIDIA Parakeet TDT 0.6B v3: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- Whisper.net (alternative STT): https://github.com/sandrohanea/whisper.net
- Telegram.BotAPI: https://www.nuget.org/packages/Telegram.BotAPI/
- Telegram Bot API: https://core.telegram.org/bots/api
- Anthropic C# SDK: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/csharp
- ASP.NET Core SignalR: https://learn.microsoft.com/aspnet/core/signalr/introduction