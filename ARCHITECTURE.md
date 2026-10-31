# Architecture

## Layers

```
 Vue components ──▶ Pinia stores ──▶ service interfaces ◀── mock implementations (swap for real ones)
 (src/components,    (src/stores)     (src/services/          (src/services/mock, speech, intent)
  src/features,                        interfaces.ts)
  src/app)                                 ▲
                                           └── composition root: src/services/container.ts
```

- **Components never call services directly**; they use stores. Stores resolve services through `getServices()` (`services/container.ts`), because they run outside component setup.
- **`services/container.ts` is the only file that knows which implementations are in use.** To integrate a backend, write classes implementing the interfaces in `services/interfaces.ts` and change the wiring there. Nothing else changes. No REST/GraphQL assumption is baked in; every method is async.
- `main.ts` calls `setServices(createMockServices(...))`, applies the theme, creates Vuetify/Pinia/router, runs `loadAllStores()`, then mounts.

## Directory map

| Path | Contents |
|---|---|
| `src/app/` | `App.vue` (Vuetify `v-app` wrapper), `AppShell` (header + nav + banner + router view + voice modal), `AppHeader`, `AppNav`, `router.ts` |
| `src/components/hud/` | Reusable HUD primitives: `HudPanel`, `HudButton`, `HudIconButton`, `HudSegmented`, `HudModal`, `MemberAvatar`, `ProgressRing` |
| `src/components/voice/` | `MicButton` (all visual states), `LocalMic`, `VoiceModal`, `TranscriptDisplay`, `ActionPreview`, `Waveform` |
| `src/components/calendar/` | `EventRow`, event icon mapping |
| `src/features/*` | Feature UI and logic: `family` (home screen, agenda, clock, banner), `groceries`, `chores` (incl. pure `scoring.ts`), `messages`, `weather`, `voice` (context resolver + launcher composable) |
| `src/stores/` | Pinia stores (below) |
| `src/services/` | Interfaces, container, `mock/` repositories + persistence, `speech/` adapters, `intent/` interpreter, validator, executor |
| `src/models/index.ts` | All domain types |
| `src/themes/` | Theme tokens, `applyTheme`, global SCSS |
| `src/data/seed.ts` | Demo data, generated relative to "now" |
| `tests/unit`, `tests/e2e` | Vitest and Playwright |

## Navigation and modals

`/groceries`, `/tasks`, `/messages` and `/photos` are real routes that all render `HomeHost.vue`: Home stays mounted and the matching `FeatureModal` opens over it (`route.meta.modal`), so the back button and deep links work and closing returns to `/`. `HudModal size="full"` is positioned *under* the header (`top: var(--hud-header-h)`), keeping the global mic and member avatars live; changing the member filter while a modal is open updates it in place. Nested dialogs (editors, the photo viewer, the voice modal) use `layer="top"`. `/calendar` is an ordinary screen whose view (Day/Week/Month) lives in the header and in the `calendar` store.

With a member selected, `HomeScreen` renders `MemberDashboard` instead of the family layout; both read the same filtered stores. The identity banner appears only on screens that don't have their own member header.

## Recurrence and occurrences

`features/calendar/recurrence.ts` expands `RecurrenceRule`s (daily/weekly with `byWeekday` and `interval`, monthly, `until`) into dated occurrences with ids `<seriesId>#<date>`. The mock calendar repository stores base events and expands on `listEvents`; editing or deleting any occurrence acts on the whole series (an edit keeps the series start date and adopts the new time of day). Chores reuse the same rule engine (`features/chores/occurrence.ts`): a chore's `dueDate` is its start, "due today" is derived, and the completion key is `choreId@<occurrence date>`.

## Domain models (`src/models`)

`FamilyMember`, `CalendarEvent` (+ `RecurrenceRule`), `ShoppingItem`, `Chore`, `ChoreCompletion`, `Achievement`, `Message`, `Reminder`, `Photo`, `WeatherSnapshot`, `VoiceInteractionContext`, `VoiceCommand`, `ProposedAction` (+ `ActionPayload` union).

Design decisions worth knowing:

- Members carry a semantic `accent` key (`blue|magenta|teal|amber|violet`), not a hex. Themes map keys to colors.
- `FamilyMember.permissions` (`fullAccess`, `kidsMode`, `limitedPurchases`, `visibleOnKiosk`) exists to support parental controls later; nothing enforces it yet.
- Messages have a `private` flag; the home preview shows "Private message" instead of the body.
- `Message.senderId` may be `'family'`: the shared kiosk often doesn't know who is speaking, so we don't guess.
- `ChoreCompletion.occurrenceKey` (`choreId@dueDate`) is the idempotency key.

## Theming

`themes/cyberhud.ts` defines every token (`ThemeDefinition.tokens`); `applyTheme()` writes them to `:root` as `--hud-*` before first paint. Components consume only `var(--hud-*)`. Adding a theme = add a file and register it in `themes/index.ts`. Member colors are tokens too (`--hud-accent-<key>`). The Vuetify theme is derived from the same tokens in `main.ts`. Vuetify is used only as the app wrapper for now; the look is custom.

Sizing: `html { font-size: min(1.25vw, 2vh) }`, so `1rem = 16px` at 1280×800 and layouts scale with the viewport. Touch minimum is `--hud-touch-min` (3.25rem ≈ 52px). `prefers-reduced-motion` is handled globally and per-component (the mic keeps distinct static cues).

## State (Pinia)

| Store | Responsibility |
|---|---|
| `family` | Members, **global selected-member filter** (`selectedId`), `matchesFilter()` |
| `clock` | Shared ticking `now`, `today`, `weekStart` |
| `calendar` | Events window, selected date (`anchor`) + `view` (Day/Week/Month; preserved across filter changes), `step`/`select`/`goToday`, filtered `onDay()`, `save`/`remove` |
| `chores` | Chores, completions, badges; due-today derived from recurrence; `complete()` (guards double taps and non-due chores); `save`/`remove`; points, level, streak, history derived via `features/chores/scoring.ts` |
| `groceries` | Items + suggestions, category counts, add/update/remove/clear purchased, optimistic purchased toggle with rollback |
| `messages` | Unified feed (messages, announcements, notes, reminders), member-filtered; `canReveal()` for private messages; delete, reminder done |
| `photos` | Photos scoped to the member filter, favorites |
| `weather` | Snapshot; keeps last good value if a refresh fails |
| `voice` | The voice state machine (below) |
| `bootstrap.ts` | `loadAllStores()` at startup, `refreshAfterAction()` after a voice commit |

**Scoring is derived, never stored.** `totalPoints`, `weeklyPoints` and `levelFor` are pure functions over `ChoreCompletion[]`, de-duplicated by `occurrenceKey`.

## Voice pipeline

```
 mic press ─▶ useVoiceLauncher.launch(override, origin)
              └ resolveVoiceContext(shell context, origin, local override)   (most specific wins)
 voice store: closed → requesting-permission → listening → processing → reviewing → executing → success
                                                  │             │            │            │
                                                  └─────────────┴────────────┴────────────┴──▶ error (retry/close)
 services:  SpeechCapture.permission/request
            SpeechRecognizer.start(handlers, context)      ← Mock (scripted) | Browser (Web Speech) | future native bridge
            IntentInterpreter.interpret(text, ctx, members) ← RuleBased (stand-in for an LLM/NLU)
            ActionValidator.validate(command, ctx)          → ProposedAction | unclear/invalid
            …user reviews and taps Confirm…
            CommandExecutor.execute(action)                 → repositories
            SpeechFeedback.speak(...)                       ← Null | Browser TTS
```

Rules enforced in code and covered by tests:

- **One modal, one pipeline.** The global mic (header) and local mics (`LocalMic`) call the same launcher and open the same `VoiceModal`. Local mics only add context.
- **Transitions are a table** (`VOICE_TRANSITIONS`); illegal moves are ignored, which makes double taps harmless. A commit in flight (`executing`) can't be cancelled.
- **Stale-callback guard.** Each run has a session id; late recognizer/validator/executor results from a cancelled or restarted run are dropped.
- **Review before commit.** Nothing is written until `confirm()`. Destructive actions (`grocery.remove`) and outgoing ones (messages, reminders) show recipients/content, and destructive ones use a danger button.
- **No false success.** `success` is entered only after `executor.execute` resolves OK. A failed save shows `execution-failed` with a "retry the commit" path that returns to the same reviewed proposal.
- **Ambiguity asks, never guesses.** A calendar request without a time yields `unknown` + `ambiguity.options`, shown as a retry prompt. (A tappable clarification list is Phase 3.)
- **Idempotent writes.** Repeating "add yogurt" skips items already on the list; completing the same chore occurrence twice awards nothing.
- **Privacy.** Only the transcript is handled; raw audio is never stored. `BrowserSpeechCapture` stops its probe stream immediately.

## Mock speech

`MockSpeechRecognizer` streams a scripted phrase word by word (interim → final) chosen by `context.feature` (rotating through the scenarios that fit). It also implements `ScriptableRecognizer` so dev builds can force a scenario from the modal's DEV strip. That strip is compiled in only when `import.meta.env.DEV`, and it is chips, not a keyboard field.

## Testing

- **Vitest** (`tests/unit`): recurrence expansion and week-grid packing, calendar/chores/grocery/message/photo store behavior (series edits and deletes, streaks, privacy, filters), scoring/levels, context resolution, interpreter phrases and date/time parsing, chore store idempotency + member scoping, the full voice state machine including permission denied, unsupported, no-speech, unclear, failed commit and repeated commands.
- **Playwright** (`tests/e2e`, 1280×800, touch; `hub.spec.ts` = shell and voice, `phase2.spec.ts` = calendar, modals, dashboard): navigation, no text inputs on any screen, no overflow, filter persistence, chore points (once), local/global mic parity, contextual defaults, failure recovery, cancel discards. The `webServer` uses `scripts/serve.mjs`, because the `vite` CLI exits when stdin closes under a test runner.
