# Roadmap

Source of truth for scope is `FirstPrompt.txt` §18. Statuses: ✅ done · 🔶 partial · ⬜ not started.

## Phase 1: Foundation and visual shell ✅

Delivered: Vue 3/TS-strict/Vite/Pinia/Router/Vuetify 3 project; CyberHUD token system; responsive shell (header, nav, weather, avatars, global mic); HUD primitives (panel, buttons, segmented control, modal, avatar, ring); the glowing mic with all visual states; a realistic home screen on mock data; an interactive voice modal (state machine, mock speech, interpreter, validator, executor) wired to the mock repositories; service interfaces and a composition root; Vitest and Playwright suites; project docs.

Beyond the minimum (pulled forward because the architecture needed them): context resolver, reviewable `ProposedAction`s with confirmation, failure states, idempotent chore scoring, member filter across screens.

Not done in Phase 1: validation on real Android hardware (moved to Phase 4).

## Phase 2: Dashboard and feature screens ✅

Delivered: Day/Week/Month calendar on a shared selected date with add/edit/delete and recurrence expansion; Grocery, Chores, Messages and Photos modals (routes over a mounted Home); chore recurrence with derived "due today", streaks, badges, family goal and history; messages/notes/reminders with private-message masking and touch recipient editing in the voice review; photo grid, viewer and slideshow; per-member dashboard. All add/edit/delete flows are touch-only (steppers and chips) with two-step delete confirmation.

Deferred from the original Phase 2 list: **Settings screens** (still the placeholder; they need real device settings to be meaningful) and free-text titles (events, chores, captions), which need voice dictation (Phase 3).

Original scope:

- Calendar: Day / Week / Month views on the shared model; date selection; recurrence expansion; add/edit/delete
- Expanded Grocery modal (categories, quantity/unit, suggestions, remove with confirmation)
- Chores modal: points, streaks, badges, family goal, completion history, add/edit/delete
- Messages/Notes/Reminders modal and compose flow
- Individual member dashboard (reference screen: Liam) with profile, achievements, filtered everything
- Photo galleries (grid + slideshow, favorites, categories, captions)
- Settings screens from the reference (voice, theme, display, kiosk)
- Replace `FeaturePlaceholder` routes; open previews' expand chevrons as near-full-screen modals

## Phase 3: Voice interaction ✅

Delivered: all ten example commands from the spec; new intents for chore assignment/removal, moving and cancelling events, deleting messages, and "show me…" navigation (calendar ranges, a member's schedule, a member's photo album, opening sections); a tappable clarification step (which intent, what time, who, which event/chore/message); dictation of event titles, chore names and photo captions into forms; selected date and entity id carried in the voice context ("move it to 5 PM" from an event's detail view); opt-in spoken replies; a `NavigationService` seam so navigation is not hard-wired to the router.

Still rule-based: the interpreter is a deterministic stand-in. A real NLU/LLM or native speech bridge only needs to implement `IntentInterpreter` / `SpeechRecognizer`.

Original scope:

- Full command vocabulary (chore assignment with recurrence/points, remove/edit, "show me…", photos navigation, reminders with times)
- Tappable clarification flow ("Let's Clarify" reference)
- Local-mic context for every modal; selected date/interval and entity IDs in context
- Edit/delete by voice with destructive confirmation
- Optional spoken feedback setting; wake-word placeholder
- Evaluate a real NLU/LLM `IntentInterpreter` once integration details exist

## Phase 4: Polish and interaction testing ⬜

- Animation/HUD effects pass; chore-complete celebration screen (reference); empty/loading/sync/offline screens from the reference sheet
- Readability tuning for 12" hardware; **validate on a real Android tablet** (WebView mic permission, Web Speech availability, kiosk mode)
- Inactivity timeout back to Family view; screen-burn mitigation for always-on display
- Expand Vitest/Playwright coverage to the Phase 2–3 features

## Phase 5: Backend integration readiness ⬜

- Document REST/GraphQL contracts per interface; adapter configuration; remove direct `createMockServices` dependency from `main.ts`
- Document data and microphone requirements; Android kiosk deployment guide
- Permissions enforcement design (parental controls, per-member privacy) on top of `FamilyMember.permissions`

No production backend is implemented in any phase of this prototype.
