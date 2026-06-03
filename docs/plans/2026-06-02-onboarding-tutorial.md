# Scope — First-time onboarding tutorial

**Goal:** a guided product tour that runs on first login, that a user can **skip** or **replay** later. Lowers the "what is all this?" cliff for campaign staff and canvassers.

## UX
- A **spotlight tour**: dims the screen, highlights one UI element at a time, shows a small card with a title, one sentence, and **Back / Next / Skip** (and **Done** on the last step).
- Auto-starts on the **first** landing in the app (after the campaign selector), once per user. "Skip" or "Done" marks it complete.
- **Replay** entry point in the profile/account menu (sidebar footer) → "Take the tour again."
- Respects `prefers-reduced-motion` (no slide animations) and is keyboard-navigable (Esc = skip, ←/→ = back/next).

## Steps (role-aware, ~6)
**Director / owner:**
1. Sidebar / module nav — "Everything lives here: Voters, Canvassing, Texting, HQ."
2. Voters — "Filter your whole file in seconds; the super-voter filter finds your turnout targets."
3. Canvassing — "Cut turf on the map, generate an optimized walking route, assign it to a canvasser."
4. HQ — "Your live command center: doors, contacts, supporters, and what Candi suggests next."
5. Ask Candi — "Ask questions about your real data — it answers with actual numbers."
6. Done — "You're set. Replay this anytime from your profile menu."

**Canvasser:** a shorter 3-step variant (their turf → walk the route → log doors) — wired once the field app exists.

## Data / persistence
- **MVP:** `localStorage` flag (`candi.tourDoneV1`) — per browser, zero backend. Replay button just re-runs it.
- **V2 (cross-device):** a `user_prefs` row (`user_id`, `tour_completed_at`) so it follows the user across devices. Small migration + a `getUserPrefs`/`setTourDone` action.

## Build
- **Library vs custom:** recommend **driver.js** (~5 KB, framework-agnostic, no React-version risk, drives plain DOM — fits our hand-styled app better than the heavier react-joyride). Falls back to a tiny custom overlay if we want zero deps.
- Add stable `data-tour="voters|canvassing|hq|ask-candi"` attributes to the anchor elements (so steps don't break when classNames change).
- A `<Tour/>` client component mounted in the `(app)` layout: reads the flag, builds the role's step list, starts/var replay via a small context or a window event the profile menu fires.
- Style the tour card with our tokens (surface, accent, Geist) so it's on-brand.

## Risks / notes
- Anchors must exist when a step runs — gate the tour start on the target route (start on HQ/the default landing).
- Don't fight the campaign-selector gate — tour starts only *after* a campaign is active.
- Mobile: steps that point at desktop-only chrome need mobile equivalents or get skipped on small screens.

## MVP cut & effort
localStorage flag + driver.js + 6 director steps + replay button. **~half a day.** Role variants + server-side per-user flag are fast follow-ups.
