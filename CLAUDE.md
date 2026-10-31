# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The repo is named `corkboard`; the app is **Family Hub**: a touch-first, voice-first family dashboard for a wall-mounted ~12" landscape Android tablet (2K-class, 16:10 or 16:9). **Phases 1–3 are complete** (see `ROADMAP.md` / `TASKS.md`): Vue 3 + TS-strict + Vite + Pinia + Vue Router + Vuetify 3, all on mock data, no backend.

- `FirstPrompt.txt` is the authoritative product spec. Read the relevant section before building a feature.
- `ARCHITECTURE.md` explains layers, stores and the voice pipeline. `README.md` has setup and URL switches.
- `_assets/` holds the approved visual references (CyberHUD): `Neon Family Hub Dashboard.png` (overview of all screens), `…01_43_36 PM` (idle/home), `…01_43_45` (settings), `…01_43_56` (voice flows + state strip), `…01_44_08` (empty/loading/sync/permission/offline states), `…01_44_17` (chore-complete celebration), `…01_44_28` (member profile: Liam).

**When the images and the spec disagree, the spec wins.** For example, the images show "View All" buttons, which the spec replaces with an Open/Expand chevron. One empty state mentions "typing", but no text-entry UI is allowed.

## Commands

```bash
npm run dev                         # Vite dev server on :5173
npm run build                       # vue-tsc typecheck + production build
npm run typecheck                   # strict type check only
npm test                            # Vitest (tests/unit)
npx vitest run tests/unit/voice.spec.ts     # single file
npx vitest run -t "no speech"               # by test name
npm run e2e                         # Playwright (tests/e2e), starts its own server via scripts/serve.mjs
npx playwright test -g "chore"              # single e2e test by name
```

- The `vite` CLI **exits immediately when stdin is closed** (e.g. when launched as a background process by an agent or runner). Use `node scripts/serve.mjs` there; it runs the same dev server programmatically.
- `/?persist=0` skips localStorage (fresh seed data); `/?speech=browser` uses the real Web Speech API instead of the scripted mock. Seed data is relative to today and persisted per day.
- Hash routing (`/#/calendar`) is intentional, for static/WebView hosting.
- Tests that assert on dates use a fixed clock: Thursday 29 Oct 2026, 9:00 (`tests/unit/helpers.ts`). `createMockServices({ now })` injects it.

## Scope discipline

Work in phases (spec §18); the next one is **Phase 4** (polish, real-hardware validation, empty/offline/sync states, coverage). Do not build production backend, LLM or speech services. Interfaces and mocks only.

Keep `ARCHITECTURE.md`, `ROADMAP.md`, `TASKS.md` and `README.md` current as work progresses. At the end of each phase, record what is implemented, what is still mocked, and the recommended next tasks.

## Stack

Vue 3 (Composition API) · TypeScript strict · Vite · Pinia · Vue Router · Vuetify 3 (currently only the `v-app` wrapper; restyle anything else so it does not look like Material) · custom SCSS · Lucide icons · Vitest · Playwright. Keep Vuetify on major 3 (npm's latest is 4).

## Architectural rules that span the codebase

These are the cross-cutting constraints from the spec that every feature must respect:

- **No keyboard, no text inputs.** All text entry goes through voice. Touch handles navigation, selection, completing items and confirmation. Never add a `<input type="text">`/textarea to production UI. A text-based command simulator is allowed only in dev builds, for the mock speech adapter.
- **One voice pipeline, one modal.** A global mic in the shell and local mics inside the expanded Grocery, Chores, Calendar and Messages views all open the *same* Voice Interaction Modal. Never duplicate recognition logic per screen. The modal follows an explicit state machine: Closed → Requesting permission → Listening → Processing → Reviewing → Executing → Success / Error.
- **Context-aware voice.** A typed `VoiceInteractionContext` (route/feature, calendar view, selected date or range, selected family member, active modal, selected entity ID, known operation, originating control) is resolved from the most specific active source. For example, a mic opened while viewing Liam's chores defaults to Liam as the assignee.
- **Review before commit.** Voice output becomes a `ProposedAction` that the user confirms. Destructive and outgoing actions (deletes, messages) always need explicit confirmation. Ambiguous commands lead to clarification, never a guess. Never report success until the action actually succeeds.
- **Swappable speech layers.** Capture, STT, intent interpretation, validation, execution and speech feedback each sit behind their own interface. Use a feature-detected browser SpeechRecognition adapter plus a mock adapter. Do not assume the mic, permissions, speech service or network are available. Do not persist raw audio.
- **Repository/service interfaces for all data**: family, calendar, grocery, chores and scoring, messages, photos, weather, speech, intent. Features depend on the interfaces. Mock implementations read seed data from `data/`, with optional localStorage persistence. Stay agnostic between REST and GraphQL.
- **Points are derived** from `ChoreCompletion` records, never stored as a mutable counter. This prevents double-scoring from double taps or repeated commands.
- **Theme = tokens.** CyberHUD is the first of several interchangeable themes (Midnight and Aurora appear in Settings). Put every color, glow, border and spacing value in `themes/` as CSS variables, and never hardcode them in components. Base tokens: bg `#03111F`, panel `#061B2D`, elevated `#0A253A`, cyan `#00D9FF`, electric blue `#238BFF`, border `#14617D`, text `#EAF8FF`, secondary text `#91B5CC`.
- **Member filter is global state.** Tapping an avatar (Dad: electric blue, Jaime: magenta, Liam: aqua/teal, Ethan: amber, Lumen: ultraviolet) filters every section until it is cleared via the Family/Everyone control. It persists across navigation and across calendar view switches. Never identify a member by color alone; always pair the color with a name or avatar.
- **Design the data model for parental permissions and privacy later** (Settings shows Administrator / Standard / Kids Mode / Limited Purchases). Keep message previews on the front-door home screen non-sensitive.

Routing: `/groceries`, `/tasks`, `/messages` and `/photos` all render `features/family/HomeHost.vue`, which keeps Home mounted and opens a near-full-screen `FeatureModal` over it (`route.meta.modal`). The modals sit *below* the header (`--hud-header-h`), so the global mic and avatars stay usable; nested dialogs and the voice modal use `layer="top"`. `/calendar` is a normal screen. Selecting a member turns Home into `MemberDashboard`. Recurring events and chores share `features/calendar/recurrence.ts`.

Voice additions: the pipeline has a `clarifying` state (a validator can return `reason: 'clarify'` with tappable options whose `patch` is merged into the command and re-validated); navigation ("show me…") is an `autoRun` action executed by the voice store through `NavigationService` (`app/navigator.ts` is the router-backed implementation, replaced in `main.ts`); dictation (`context.field`) makes the whole utterance a form value that is handed to an `onDictation` callback after review, never written to data. Spoken replies are gated by `usePreferencesStore().speakReplies`. The recognizer/interpreter/validator are deliberately swappable: do not special-case phrasing in components.

Source layout under `src/`: `app/`, `components/{hud,voice,calendar}/`, `features/*`, `stores/`, `services/` (interfaces in `interfaces.ts`, the only wiring in `container.ts`), `models/`, `themes/`, `data/`. Stores reach services through `getServices()`, never by importing a mock directly. Component SCSS gets `themes/_mixins.scss` auto-injected.

## UI constraints

- Readable from several feet away, so legibility beats density. Touch targets are ≥48–56px, and primary mic buttons are ~64–72px.
- Never rely on hover. Honor `prefers-reduced-motion`. No horizontal scroll on the dashboard. Use responsive units rather than fixed device pixels.
- Use a futuristic display font for major headings only. Schedules, descriptions and controls use a readable sans-serif.
- Do not bring back the large horizontal family scoreboard. Achievements belong in member profiles or the expanded Chores view. The dashboard keeps only the compact "This Week" ring.
- Expanded sections open as large, near-full-screen modals.
