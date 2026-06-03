# Scope — GPS canvasser field app

**Source (Granola, "Campaign app: Overview" + roadmap):** Easton's #1 ask. "Cutting turf… they're able to actually cut out sections… in a GPS type of thing." Plus: *automatically generate walking routes, optimize routes, real-time turf progress, canvasser dashboard, admins can monitor the canvasser's GPS location, doors knocked, IDs collected.* He flagged it turns CANDI into a mobile app (App Store, Apple Developer status ~1 month lead).

**What already exists to build on:** turf boundaries, **optimized routes** (`turfs.route`), **assignment** (`turfs.assignee_id`), the **contacts** table (door results), Mapbox GL. The field app is largely a *consumer* of these.

## Platform decision (the big fork)
- **PWA (recommended):** an installable web route (`/field`) — works offline via service worker + IndexedDB, uses the Geolocation API, no App Store gatekeeping, ships now. Matches CANDI's locked "web-first PWA" stack.
- **Native (iOS/Android):** better **background** GPS + store presence, but +Apple Developer account (~1 mo lead, $99/yr), app review, and a second codebase (React Native / Capacitor).
- **Recommendation:** **PWA first.** Its one real limit — no *background* location (browsers only track while the app is foreground/open) — is acceptable for active canvassing (the phone is in hand, app open). Revisit native only if background tracking becomes a hard requirement.

## Core flows (canvasser, phone-first `/field`)
1. **Login** — magic-link / OTP (the P1 auth item; low-friction for volunteers).
2. **My turf** — the turf(s) assigned to me (we have assignment). Pick one to walk.
3. **Walk view** — Mapbox map + the **optimized route** line (we have it), my **live GPS dot** (`navigator.geolocation.watchPosition`), the **next stop** highlighted, and an ordered **stop list** with check-off.
4. **At a door** — log a result (Not home / Refused / Supporter 1–5 / Moved / Signed) → writes a `contacts` row (channel `door`, with support + result). Optional notes.
5. **Progress** — doors done / remaining; feeds HQ.

## Admin / HQ
- **Phase 1:** doors-done progress per canvasser (HQ already computes this from `contacts` — just surface per-turf/per-canvasser).
- **Phase 2:** **live location map** — canvassers push position to a `canvasser_locations` table (or Supabase Realtime presence) while "on shift." **Consent-gated** (canvasser opts in; only during a shift) — this is a privacy + likely legal review item, not a silent always-on tracker.

## Data model additions
- `contacts` ✔ (door results) — reuse.
- Turf `route` + `assignee_id` ✔ — reuse.
- **Stop progress:** either derive "visited" from `contacts` joined to the turf, or add `route_progress(turf_id, stop_index, result, contact_id)` for precise per-stop state. Start by deriving from contacts; add the table if we need exact stop status offline.
- **Live location (Phase 2):** `canvasser_locations(membership_id, campaign_id, lng, lat, accuracy, updated_at)` + RLS so a campaign's admins see only their canvassers; canvasser can purge.

## Offline (Phase 2 — the hard part)
- Service worker caches the app shell + the assigned turf/route payload.
- **IndexedDB queue** for door-result writes; **background sync** flushes when back online.
- Conflict handling is simple (contacts are append-only inserts — low conflict risk).

## Tech
- PWA manifest + service worker (`next-pwa` or hand-rolled), Geolocation `watchPosition`, IndexedDB (`idb`), Mapbox GL (already in), Supabase for sync. Magic-link auth dependency.

## Phasing
- **Phase 1 (MVP, online-only, ~1 wk):** `/field` route, magic-link login, "my turf + route" map, live GPS dot, stop list + check-off, log door result → `contacts`. HQ shows per-canvasser doors-done. **Leans entirely on what we just built.**
- **Phase 2 (~1–2 wk):** installable PWA + offline cache + IndexedDB queue/sync.
- **Phase 3:** live admin GPS map (Realtime + consent), route re-optimization, multi-day turf.

## Risks
- **Background GPS:** PWAs only track foreground — fine for active canvassing, not passive tracking.
- **iOS PWA quirks:** geolocation + install prompts are weaker on iOS Safari; test early.
- **Privacy/consent + battery:** location tracking needs explicit canvasser consent and a clear on/off; surface battery cost.
- **Dependency:** magic-link auth should land first (volunteer login).

## Recommendation
Build **Phase 1 as a PWA** next — it converts the turf/route/assignment work we just shipped into the field tool Easton actually asked for, with no App Store delay. Decide native vs PWA-background only if Phase 1 surfaces a real background-tracking need.
