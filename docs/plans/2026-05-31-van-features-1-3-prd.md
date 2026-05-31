# CANDI — PRD: VAN-parity Features 1–3

**Date:** 2026-05-31
**Source of requirements:** Granola — May 16 VAN walkthrough + May 15 planning (see memory `candi-van-requirements`).
**Scope:** The three web features that close the biggest gaps vs NGP VAN. Feature 4 (canvasser GPS + mobile field app) is **out of scope here** — it's a separate interactive build (Apple dev account NOT being started per direction).
**Build order:** 1 → 2 → 3 (2 depends on 1; 3 reads data produced by 1–2). Autonomous-executable after this spec; UX polish is a separate interactive pass.

Stack invariants: Next.js 16 (App Router, `proxy.ts`, async `cookies()`), Supabase SSR + RLS (campaign-scoped via `user_campaign_ids()`), Mapbox GL, design system in `app/globals.css`. Active campaign comes from `getActiveCampaignId()` (cookie), never a hardcoded id.

---

## Feature 1 — Super-voter filters (Easton's lead filter)

**Why:** The filter he *opens VAN with*: "at least N of last M elections" (his 3-of-4 "super voters"), plus race and gender (Broward targeting), plus city/municipality. We don't have these.

### Schema (migration)
- `voters`: add `race text`, `gender text` (`'M'|'F'|'X'|null`), `registration_date date`.
- **Per-election vote history**: store `voters.vote_history` jsonb as `{ "<election_code>": true|false }` (e.g. `{"2024G":true,"2022G":true,"2020G":false,"2024P":true}`) instead of just `{label}`. Keep a `label` convenience field too.
- New `elections` reference (per campaign or global): `code text`, `name text`, `date date`, `kind text('general'|'primary'|'municipal')`, `seq int` — so "last M" is well-defined and ordered. Seed the recent cycle set.
- Indexes: `voters(campaign_id, race)`, `voters(campaign_id, gender)`. Vote-history count filtering uses a SQL expression / generated column `vote_count int` (count of `true` in the jsonb) with index `voters(campaign_id, vote_count)`.
- Update `lib/mock-data.ts` + seed so demo voters get race/gender/per-election history.

### UI (`components/voters/voters-view.tsx` + facets, all data-derived)
- **Vote history → super-voter control:** "Voted in at least **[N]** of the last **[M]** elections" (two small steppers/selects, default N=3 / M=4). Replaces perfect/skipped/new (or sits alongside). Live count updates.
- **Race / ethnicity** facet: distinct values from the loaded set + counts (multi-select).
- **Gender** facet: M / F / X + counts.
- **City / municipality** facet: distinct `city` values + counts (precinct stays).
- All wire into the existing `filtered` memo + the active-filter chip bar + Clear-all.

### Acceptance
- Setting N/M to 3/4 returns only voters with ≥3 `true` of the last 4 elections (verified against seed).
- Race, gender, city filters narrow results with correct live counts; combine with party/precinct/support/tags.
- RLS unchanged; queries stay campaign-scoped. `pnpm build` clean.

---

## Feature 2 — Filtered list drives the turf (the marquee VAN behavior)

**Why:** In VAN the turf map pins **only the filtered doors** (super-voters), shows **doors-vs-people counts**, and turf is precinct-aware. Today our map draws/saves polygons but shows no voter pins or counts.

### Data
- Voters already have `geom geometry(Point,4326)` + GiST index. New RPC `voters_in_polygon(p_campaign uuid, p_geojson jsonb, p_filters jsonb)` → returns `{ doors int, people int, points jsonb }` using `ST_Within(geom, ST_GeomFromGeoJSON(...))`; `doors` = distinct address, `people` = row count; `points` capped (e.g. 2,000) for display. Filters mirror Feature 1 so the map respects the active voter filter.
- Lighter MVP path acceptable for the seeded demo: pass the already-filtered voter points to the map and do point-in-polygon client-side (turf.js-free, ray-cast helper) — but **the RPC is the scalable target** (400k+ voters can't ship to the client). Spec the RPC; note the fallback.

### UI (`components/canvassing/turf-map.tsx`)
- Render filtered voters as a Mapbox circle layer (color by party or support), only those matching the current filter.
- On `draw.create`: call the count path → show **doors vs people** with a toggle + the live count in the legend; persist counts onto the saved turf (`turfs.voter_count`, `turfs.door_count` already exist).
- Optional precinct overlay (line layer) so turf can be cut precinct-aware.
- Share the filter state with the Voters view (lift to a small shared store or URL params).

### Acceptance
- Changing voter filters changes which doors pin on the map.
- Drawing a polygon shows accurate doors + people counts for voters inside it; saved turf stores both.
- Works on the seeded campaign; empty campaigns show 0 cleanly. `pnpm build` clean.

---

## Feature 3 — Live HQ dashboard (kill the mock data)

**Why:** HQ KPIs, the "Knock velocity" chart, and "Canvassers in field" are hardcoded. Easton's metrics: doors knocked, contacts/IDs, supporter %, VBM, turf completion, field activity.

### Data (all RLS-scoped, from the active campaign)
- KPIs: doors knocked today (`contacts` where channel='door', today), contacts made + rate, supporters ID'd (`voters.support>=4` or contacts), VBM returned (`voters.flags` / a vbm status).
- **"Knock velocity" chart** = real series: contacts per day for the last 14 days, with **Doors / Contacts / Support** as the three series (group `contacts` by day + channel/result). This answers "what is this chart + give it real data."
- Canvassers in field: from `memberships` (role='canvasser') + their assigned `turfs` + recent `contacts` (live GPS deferred to Feature 4 — show last-activity + door counts for now).
- Seed a realistic `contacts` set for the demo campaign so the dashboard isn't empty.

### UI (`app/(app)/page.tsx`)
- Convert to live queries (server component already async). Keep the editable `ElectionCallout`. Replace `velocity`/`suggestions`/`canvassers` constants with query results. Empty states when no data.

### Acceptance
- KPI numbers and the chart reflect rows in `contacts`/`voters`/`turfs` for the active campaign (change the data → numbers change).
- Toggling Doors/Contacts/Support re-renders the chart from real series. `pnpm build` clean.

---

## Cross-cutting
- **RLS first:** every new query/RPC scoped via `user_campaign_ids()`; RPCs `security definer` with explicit campaign checks.
- **Performance:** keep the composite indexes; never ship 400k rows to the client (server-side counts/pagination).
- **Empty states** for brand-new campaigns (created via the selector) across all three.
- **UX polish** (spacing, motion, mobile) handled in a separate interactive pass with `/ui-ux-pro-max` + `/ui-designer` after functional build.

## Out of scope (Feature 4, later)
Canvasser mobile field app, real-time GPS tracking, route optimization, MiniVAN-style list/bird's-eye, App Store. Architected interactively; Apple developer account deferred per direction.
