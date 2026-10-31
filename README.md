# Family Hub

A touch-first, voice-first family dashboard for a wall-mounted ~12" landscape Android tablet near the front door. Vue 3 + TypeScript + Vite, themed with the futuristic **CyberHUD** design system.

**Status: Phases 1 and 2 complete** (shell, home, voice modal, calendar views, grocery/chores/messages/photos modals, member dashboards). Everything runs on mock data; there is no backend. See [ROADMAP.md](ROADMAP.md) and [TASKS.md](TASKS.md).

## Setup

```bash
npm install
npm run dev            # http://localhost:5173  (also reachable on the LAN: --host is on)
```

Requires Node 20+. For e2e tests, install a browser once: `npx playwright install chromium`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`vue-tsc`) then production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Strict TypeScript check only |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npx vitest run tests/unit/voice.spec.ts` | One unit test file |
| `npx vitest run -t "pattern"` | Tests whose name matches |
| `npm run e2e` | Playwright e2e (`tests/e2e`); starts the dev server itself |
| `npx playwright test -g "pattern"` | One e2e test by name |

### URL switches (dev/demo)

| Query | Effect |
|---|---|
| `?persist=0` | Don't read/write localStorage; always start from fresh seed data |
| `?speech=browser` | Use the real Web Speech API instead of the scripted mock recognizer |

Demo data is generated relative to "today" and persisted per day in `localStorage` (`familyhub.v1.<date>`), so the screen always looks live. Clear site data to reset.

## Using the prototype

- Tap an **avatar** in the header to filter everything to that person; tap **Family** (or *Family / Everyone* in the banner) to go back.
- Tap any **mic** (header, or the circular mics in Grocery / Chores / Messages) to open the same voice modal. With the mock recognizer it "hears" a scripted phrase suited to where you tapped, shows what it understood, and only changes data after you confirm.
- In dev builds the voice modal has a **DEV · mock voice** strip of chips (not a text field) to force scenarios, including failures: *No speech*, *Mic blocked*, *Network down*, *Unclear request*.
- Tap a **chore** to complete it and earn points; tap a **grocery** row to tick it off.
- Tap a panel's **chevron** (or a nav item) to open the full **Grocery, Chores, Messages or Photos** modal; **Calendar** has Day / Week / Month in the header. Add, edit and delete are all by touch (steppers and chips, since there is no keyboard); every delete asks for a second tap.
- Pick a member to see their **dashboard** (profile, level, schedule, week, chores, upcoming, messages, photos).
- Voice review for messages lets you change the recipients by touch before sending.

## Android kiosk deployment notes

Not yet validated on hardware (Phase 4). Planned approach and constraints:

- The app uses **hash routing**, so it can be served from any static host or a WebView asset folder without rewrite rules.
- Run full-screen in a kiosk shell (e.g. a Fully Kiosk Browser / a dedicated WebView app) with screen-always-on and auto-start on boot.
- `getUserMedia` and the Web Speech API need a **secure context** (https or `localhost`) and microphone permission granted to the WebView. Web Speech recognition is not available in every Android WebView; the app feature-detects it and shows a clear "voice unavailable" state. A native speech bridge can implement the `SpeechRecognizer` interface later.
- Layout is viewport-relative (`1rem = min(1.25vw, 2vh)`), designed against 1280×800 CSS px (16:10) and verified at 16:9 and 2K-class sizes.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): components, domain models, service interfaces, state
- [ROADMAP.md](ROADMAP.md): phases and milestones
- [TASKS.md](TASKS.md): task list with status
- [FirstPrompt.txt](FirstPrompt.txt): the original product spec; `_assets/` holds the approved visual references
