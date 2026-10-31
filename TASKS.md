# Tasks

`[x]` done · `[~]` partial · `[ ]` open

## Phase 1: Foundation and visual shell

- [x] Initialize Vue 3 + TS (strict) + Vite + Pinia + Router + Vuetify 3 + Vitest + Playwright
- [x] CyberHUD design tokens and `applyTheme` (theme-token system, no hardcoded colors in components)
- [x] Responsive shell: header (brand, clock/date, weather, avatars, settings, global mic), left nav, member banner
- [x] Calendar view tabs in the header on calendar routes (state in `calendar` store)
- [x] HUD primitives: panel, button, icon button, segmented, modal, avatar (initials fallback), progress ring
- [x] Microphone component with idle/ready/listening/processing/permission/confirm/success/error + reduced-motion
- [x] Home screen on mock data: clock + weather + forecast, Today/Tomorrow agenda, Family at Home, This Week ring, Grocery/Chores/Messages previews
- [x] Member filter (global), persists across navigation; Family/Everyone restore
- [x] Voice modal prototype with state machine, mock + browser speech adapters, interpreter, validator, executor
- [x] Service interfaces + mock repositories + optional localStorage persistence
- [x] Chore completion with derived points, idempotent
- [x] Empty states for agenda, grocery, chores, messages
- [x] Unit and e2e tests green (Phase 1 suite; extended in Phase 2); docs written
- [x] Placeholder screens for the Phase 2 sections (replaced in Phase 2; only Settings remains a placeholder)
- [ ] Verify on real Android tablet hardware (Phase 4)

## Phase 2: Feature screens ✅ (Settings deferred)

- [x] Calendar Day view
- [x] Calendar Week view (week navigation, date selection, overlap layout)
- [x] Calendar Month view (event dots, selecting a date shows events)
- [x] Recurrence expansion for `RecurrenceRule` (daily/weekly/monthly, intervals, until)
- [x] Event add/edit/delete (touch editor; series-aware)
- [x] Grocery modal: categories, quantity/unit, suggestions, remove with confirm, clear purchased
- [x] Chores modal: assign, edit, delete, recurrence, history, streaks, badges, family goal, progress rings
- [x] Messages/Notes/Reminders modal; recipient editing in the voice review; private masking
- [x] Member dashboard (profile, level, schedule, week, chores, upcoming, messages, photos)
- [x] Photos gallery (grid/viewer/slideshow, favorites, categories, member filter)
- [ ] Settings screens (deferred; still a placeholder)
- [x] Expand chevrons open near-full-screen modals

## Phase 3: Voice ✅

- [x] Chore assignment ("every Wednesday for twenty points") and removal intents
- [x] Voice dictation for free-text titles (events, chores, captions), reviewed before use
- [x] Voice move/cancel of calendar events, delete of messages, photo captions by dictation
- [x] "Show me…" navigation intents; photos intents
- [x] Tappable clarification options
- [x] Selected date and entity id in `VoiceInteractionContext` (event detail, photo viewer, calendar)
- [x] Spoken feedback setting (opt-in toggle in the voice window)

## Phase 4–5

See [ROADMAP.md](ROADMAP.md).

## Known limitations / follow-ups

- Mock recognizer only "hears" scripted phrases; real speech is via `?speech=browser` and is untested on Android.
- Time parsing treats a bare hour 1–6 as PM and 7–11 as AM; "next Tuesday" means the nearest upcoming Tuesday.
- Avatars are initials (no photo assets yet); `photoUrl` is supported and falls back on load error.
- Weather is a static mock; there is no refresh interval yet.
- Seed data is persisted per day in localStorage; there is no in-app "reset demo data" control yet.
- `npm audit` reports moderate advisories in dev-only transitive deps of `@vue/test-utils` (not shipped).
