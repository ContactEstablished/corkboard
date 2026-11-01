# Home Kiosk Backend

ASP.NET Core (.NET 10) backend for the kiosk. The development spec is `Backend Code Prompt.md` at the
repository root. Its section 5 is the front-end contract.

## Status

| Milestone | State |
|---|---|
| **M1: Skeleton and lists** | ✅ Done |
| **M2: Command pipeline (rules)** | ✅ Done |
| **M3: Speech-to-text** | ✅ Done |
| **M4: Telegram (text)** | ✅ Done |
| M5: LLM parsing, Telegram extras | Next |
| M6: Deploy | — |

### M1: what's implemented
- Solution layout per spec §3: `HomeKiosk.Core` (domain, list service, text normalization; no infrastructure
  references), `HomeKiosk.Infrastructure` (EF Core + SQLite, SignalR notifier), `HomeKiosk.Api` (host).
- EF Core + SQLite with an initial migration, WAL mode, soft-delete query filters, and the spec §11 indexes.
  Migrations and seeding (Grocery as default, To-do) run on startup.
- Every list/item REST endpoint in §5.3 except `/api/commands`, `/api/voice`, `/api/undo` and
  `/api/commands/recent` (M2/M3).
- Dedupe on add: a matching open item returns 200 with the existing item. A matching completed item is reopened.
- SignalR hub at `/hubs/kiosk` with `ListChanged` and `ListsChanged`. (`CommandProcessed` arrives with M2.)
- Kiosk key auth: `X-Kiosk-Key`, or `Authorization: Bearer` / `access_token` from the SignalR client.
  Compared in constant time. `/api/health`, `/openapi/v1.json` and `/scalar` are anonymous.
- Errors are RFC 9457 ProblemDetails (400 with field `errors`, 401, 404, 409).
- OpenAPI at `/openapi/v1.json` (give this to the front end) and Scalar UI at `/scalar`.
- Serilog: console + daily rolling file, 14 days kept.

### Decisions the spec left open
- `GET /api/lists/{slug}` includes completed items unless `includeCompleted=false`. This matches the
  `ListChanged` snapshot, which always includes them.
- Renaming a list keeps its slug, so URLs and open views stay valid.
- List names, slugs and aliases share one namespace (409 on a clash), so a spoken list name is never ambiguous.
  Slugs are unique among live lists only, so a deleted list's name can be reused.
- `POST /api/lists/{slug}/clear` with no body means `completedOnly: true`.
- `PATCH /api/items/{id}` with `quantity: ""` clears the quantity. Omitted fields are left unchanged.
- `isDefault: false` on the default list is rejected (400). Make another list default instead.
- Limits: list name and alias ≤ 50 characters, ≤ 10 aliases, item text ≤ 100, quantity ≤ 50.

### M2: what's implemented
- `POST /api/commands`, `POST /api/undo` and `GET /api/commands/recent` (spec §5.3). The `CommandProcessed`
  SignalR event is sent for every command, including ones that weren't understood.
- One pipeline in `Core/Commands`: `CommandService` (parse → execute → log → notify), `RuleBasedCommandParser`,
  `CommandExecutor`, `ReplyFormatter`. Every row of spec table §6.6 marked "rules" is a unit test
  (`RuleBasedCommandParserTests`), alongside about 70 other phrasings.
- List resolution: default, then slug/name/alias, then fuzzy (Levenshtein ≤ 2). Unknown lists are never created.
  Item resolution: exact → singular/plural → contains → fuzzy. Several matches are reported as `ambiguous` and the
  reply names the candidates.
- Speech-style input is tolerated: punctuation, casing, filler ("hey, can you … please"), quantities
  ("two gallons of milk" → quantity "two gallons").

### M2 decisions
- **The command log commits in the same transaction as the item changes**, not after them, so undo history can
  never disagree with the data. If a command fails, its changes are discarded and only a log entry with the error
  is saved. The reply is then "Sorry, something went wrong. Nothing was changed."
- **Exact undo:** `ActionsJson` stores each action as the client saw it, plus the per-item effects (added,
  removed, completed, reopened with its previous completion time, list created). Undo reverts exactly those effects.
  Reads don't count as "the last change". A second undo replies "There's nothing to undo." (one step, per spec).
- The rules also cover several §6.6 rows marked "llm": "we're out of coffee", "we need paper towels and dish soap",
  "I got the eggs", and "add milk and check off bread". This saves the LLM round trip; the LLM fallback arrives
  in M5.
- An unknown list name is only assumed after "to", "onto", "from" or "off", so "add drill bits to hardware" gets the
  not-found reply, but "add cream cheese on sale" doesn't invent a list called "sale".
- A few "x and y" items stay whole ("mac and cheese", "salt and pepper", and any open item containing "and").
- `/api/commands` runs with source `api` and `addedBy` "Kiosk".
- Deferred to the milestone the spec assigns it: `CompositeCommandParser` + LLM (M5).

### M3: what's implemented
- `POST /api/voice` (multipart, field `audio`) → `ICommandService.HandleAudioAsync` → the same pipeline as typed
  text. Responses carry `transcript` and `timings.sttMs`; the command log records the transcript, clip length
  and STT time. Source `voice`, `addedBy` "Kiosk".
- `ParakeetSpeechToText` (Parakeet TDT 0.6B v3 int8 via sherpa-onnx 2.0.1, CPU, greedy search, decodes serialized
  behind a semaphore). `SttWarmupService` loads it in the background and decodes 1 s of silence;
  `/api/health` reports `stt: loading → ready`, or `error` when the model is missing or broken.
- Audio: `WavDecoder` (16 kHz mono PCM16, sniffed from the bytes, no dependencies) and otherwise
  `FfmpegAudioDecoder` (`ffmpeg … -ac 1 -ar 16000 -f s16le pipe:1`, 10 s timeout).
- Limits (spec §5.4): >2 MB or >30 s → 413; <0.3 s or an empty transcript → 200, `understood: false`,
  "I didn't catch that."; STT loading or broken → 503; unreadable audio → 400 (`errors.audio`).
- `scripts/download-models.sh` / `.ps1` fetch the model into `models/parakeet-tdt-0.6b-v3-int8/`.
- Fixtures in `tests/fixtures/` (synthesized with Windows' built-in TTS, 16 kHz mono; plus an Ogg/Opus copy).
  `SttModelTests` (`[Trait("Category","RequiresModel")]`) runs them against the real model. Measured on the dev box
  (4 threads): 117 ms STT for a 2.5 s clip, 247 ms for a 4.9 s one. The target box still needs measuring.

### M3 decisions
- **The content type is a hint only.** The fast path is chosen by sniffing the RIFF header, because browsers
  label WAV blobs inconsistently. Anything else goes to ffmpeg, so there is no 415.
- **A broken STT setup doesn't stop the app.** A missing model or an unknown `Stt:Engine` leaves `stt: "error"`
  and `/api/voice` answers 503. Everything else keeps working. The model loads after the server starts listening.
- ffmpeg is told to stop at `MaxSeconds + 1`, so a long Opus file can't decode into hundreds of MB. The 30 s
  check then rejects it.
- Empty transcripts are logged as warnings with the clip length (spec §8.1 int8 quirk). Short or silent clips skip
  the parser entirely, so M5's LLM fallback won't be called for them.
- `Stt:Engine` accepts only `Parakeet`. Whisper.net (§8.2, optional) and `Stt:SaveAudioForDebug` (§8.4) are not
  built. No audio is stored.
- **Fixed in M2 code:** items added by one command shared a `CreatedAt`, and v7 GUIDs within the same millisecond
  sort randomly, so "add milk, eggs and bread" could show in any order (two M2 tests were flaky because of it).
  Each new item is now one tick after the newest item on its list, and ambiguous-item candidates are listed in
  that order.

### M4: what's implemented
- A Telegram bot over **long polling** (`TelegramPollingService`): `getMe`, `deleteWebhook` and `setMyCommands`
  on connect, then `getUpdates` with a 30 s timeout. Each update is handled in its own scope and try/catch.
  Network errors back off from 1 s to 60 s. A rejected token (401/404) turns the bot off.
- `/api/health` `telegram`: `disabled` (no token or `Enabled: false`), `connected`, or `error` (backing off,
  token rejected, unsupported `Mode`). A Telegram problem never stops the app.
- `ITelegramGateway` (`TelegramBotApiGateway` over Telegram.BotAPI 10.3.1) carries every Bot API call, so
  `TelegramUpdateHandler` is tested against a fake.
- Allowlist (`Telegram:AllowedChats`): any other chat gets "This bot is private. Your chat ID is … Ask the admin
  to add it." and nothing else happens (logged as a warning). `AddedBy` is the allowlist name in a private chat
  and the sender's first name in a group.
- Free text goes through `HandleTextAsync` (source `telegram`). Slash commands: `/list [name]`, `/lists`,
  `/add <items>`, `/done <item>`, `/clear [name]` (completed only), `/undo`, `/help` (and `/start`).
- Replies are HTML (`parse_mode = HTML`) with `&`, `<` and `>` escaped. A list reads as a bold name and a bullet
  per open item, with the quantity in parentheses (`ReplyFormatter.ForTelegram`).
- **Update-ID dedupe:** a redelivered update returns the stored reply without applying anything again
  (`CommandLog.TelegramUpdateId`, unique index from M1).

### M4 decisions
- **Group chats only answer what they understand.** With privacy mode off the bot sees every family message.
  Text no parser understands is treated as conversation (`CommandOrigin.IgnoreUnrecognized`): it is not logged,
  broadcast to the kiosk, changed or answered. Slash commands always answer. In private chats the usual
  "I didn't catch that" hint is sent. Group replies quote the message they answer.
- `/list@OtherBot` in a group is ignored. `/list@ThisBot` and plain `/list` are handled.
- `CommandResponse.reply` stays plain text (the kiosk toast shows it). The HTML version exists only for Telegram.
- Slash commands with a fixed meaning (`/list`, `/lists`, `/clear`) skip the parser
  (`ICommandService.HandleCommandsAsync`, logged with parser `none`, like undo). `/add` and `/done` go through
  the parser as "add …" / "check off …", so items split exactly as they do in speech.
- The non-allowlisted reply is sent for every message, so an admin can always find a chat's ID by messaging the bot.
- The gateway uses its own `HttpClient`, not `IHttpClientFactory`: the factory's request logging would write the
  bot token, which is part of every Bot API URL. Checked: an invalid token gives `telegram: "error"` and the
  token appears in neither the console nor the log file.
- Deferred to M5, where the spec puts them: voice notes (for now they get "I can't listen to voice notes yet"),
  inline check-off buttons (`callback_query` is already requested and then ignored), and `Telegram:NotifyChatId`.
  Webhook mode (`/api/telegram/webhook`) waits for a cloud deployment (it needs a public URL); `Mode: Webhook`
  reports `error` for now.
- **For M5:** with `RulesThenLlm`, every unrecognized group message would go to the LLM. Group chats should
  probably stay rules-only, or only use the LLM when the bot is mentioned.

### Not yet done (later milestones)
M5: LLM parsing, Telegram voice notes (reusing `HandleAudioAsync` with `audio/ogg`), inline check-off and kiosk
notifications. §12: rate limiting and the 16 KB JSON body limit. M6: backups and deployment (the Dockerfile must
`apt-get install ffmpeg` and publish `-r linux-x64` so only that sherpa-onnx native runtime ships).

## Running locally

Requires the .NET 10 SDK (pinned in `global.json`).

```bash
cd backend
scripts/download-models.sh            # or: pwsh scripts/download-models.ps1   (~640 MB, once)
dotnet run --project src/HomeKiosk.Api --launch-profile http   # http://localhost:5079
dotnet test                                                      # all tests (Microsoft.Testing.Platform)
dotnet test -- --filter-not-trait "Category=RequiresModel"       # skip the real-model STT tests
```

Voice needs ffmpeg on PATH for anything other than 16 kHz mono WAV (`winget install ffmpeg` on Windows).
Tests that need ffmpeg or the model skip themselves when either is missing. The model tests look in
`models/parakeet-tdt-0.6b-v3-int8`, or wherever `KIOSK_STT_MODEL` points.

Try it with a fixture:

```bash
curl -H "X-Kiosk-Key: dev-only-kiosk-key-not-for-production-0123456789" \
     -F "audio=@tests/fixtures/add-milk-to-the-grocery-list.wav;type=audio/wav" http://localhost:5079/api/voice
```

In Development:
- The database and logs go to `src/HomeKiosk.Api/data/` (git-ignored).
- The kiosk key is `dev-only-kiosk-key-not-for-production-0123456789` (from `appsettings.Development.json`).
- CORS allows the Vite dev server at `http://localhost:5173`.
- `Stt:ModelPath` is `../../models/parakeet-tdt-0.6b-v3-int8` (relative to `src/HomeKiosk.Api`, i.e. `backend/models`).

Open `http://localhost:5079/scalar` to try the API.

Outside Development, set the key with `Kiosk__ApiKey` (random, at least 32 characters). The app refuses
to start without it.

### Telegram bot setup

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token.
2. For a family **group**, also send BotFather `/setprivacy` → your bot → **Disable**, so the bot sees ordinary
   messages, not just `/commands`. Then add the bot to the group.
3. Store the token outside the repo:
   ```bash
   dotnet user-secrets set "Telegram:BotToken" "<token>" --project src/HomeKiosk.Api   # dev
   # elsewhere: env var Telegram__BotToken
   ```
4. Run the app and message the bot. It replies with your chat ID (a group's ID is negative).
5. Allowlist the chats in configuration (user-secrets, env vars, or `appsettings.*.json`), then restart:
   ```json
   "Telegram": { "AllowedChats": [ { "chatId": 123456789, "name": "Matt" }, { "chatId": -100987654321, "name": "Family group" } ] }
   ```
   As env vars: `Telegram__AllowedChats__0__ChatId=123456789`, `Telegram__AllowedChats__0__Name=Matt`.

`/api/health` shows `telegram: "connected"` once the bot is polling.

Adding a migration:

```bash
dotnet ef migrations add <Name> --project src/HomeKiosk.Infrastructure --output-dir Persistence/Migrations
```

## Layout

```
backend/
├─ HomeKiosk.sln
├─ src/HomeKiosk.Api/              Endpoints/, Hubs/, Auth/, ErrorHandling/, OpenApi/, Program.cs
├─ src/HomeKiosk.Core/             Domain/, Commands/, Contracts/, Lists/, Matching/, Abstractions/, Health/
├─ src/HomeKiosk.Infrastructure/   Persistence/ (DbContext, migrations, seed), Notifications/, Speech/, Telegram/, Time/
├─ tests/HomeKiosk.Core.Tests/     Parser phrase table, list/item resolution, normalization
├─ tests/HomeKiosk.Api.Tests/      WebApplicationFactory tests over a temp SQLite file, incl. SignalR,
│                                  /api/voice with a fake STT, audio decoders, real-model STT (opt-in),
│                                  the Telegram bot over a fake Bot API
├─ tests/fixtures/                 Voice clips (WAV 16 kHz mono, one Ogg/Opus)
├─ models/                         Downloaded STT model (git-ignored)
└─ scripts/                        download-models.sh / .ps1
```

`deploy/` arrives with M6.

## Credits

Speech recognition uses NVIDIA's [Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3),
licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), in the int8 export published by
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0).
