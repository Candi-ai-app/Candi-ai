# CANDI — Competitive-Informed Roadmap (2026-06-01)

Synthesized from a competitive scan: **FrontlineHQ** (direct Broward competitor), NGP VAN + MiniVAN, the traindems VAN candidate guide, and **Rally** (Relentless). Background detail in the `candi-competitive` memory.

## Where CANDI stands (shipped)
Real **18,925-voter Easton Harrison** campaign · voter CRM (data-derived filters incl. super-voter/race/gender, editable contact card, email, **household**, tags, Call/Text/**AI-draft**, bulk queue + CSV) · turf w/ filtered pins + doors-vs-people · live HQ dashboard (range-filter chart, KPIs, canvassers) · onboarding wizard + AI auto-fill + photo + resume/delete · **Ask Candi** (Claude) · auth-isolated real-data org + 10-char passwords · UX polish (login, selector, HQ, voters).

## Competitive picture
- **FrontlineHQ** — closest competitor, **same market** (Miami-Dade/Broward/Palm Beach local). Already ships the **offline GPS walk app**, turf, household grouping, FL voter files. **No AI**; texting/VBM are paid 3rd-party add-ons. Free-through-primary GTM.
- **VAN** — partisan, **party-gatekept** access, steep learning curve.
- **CANDI's defensible wedge:** AI-native + integrated all-in-one + **nonpartisan/open access**.

## Priorities

### P0 — Close table-stakes gaps
1. **Feature 4 — GPS + offline canvasser field app.** A same-market competitor ships it and it's Easton's #1 ask → no longer optional. Decide PWA-offline vs native first; Apple developer account still deferred per earlier call.
2. **Vote-history + VBM exports** from Easton/SoE → load into `voters.vote_history.history` (unlocks the **super-voter 3-of-4 filter** on real data) and a VBM/ballot-chase list (parity with FrontlineHQ's paid VBM).

### P1 — Differentiators competitors lack
3. **Relational organizing mode** (Rally-style): volunteers work their own network → voter-file match → engagement ladder. Neither VAN nor FrontlineHQ has this.
4. **Magic-link / passwordless auth** — frictionless *and* more secure than passwords (complements the auth hardening already done).
5. Lean product + messaging into **AI + nonpartisan + all-in-one** (Ask Candi as onboarding/training; AI scripts; predictive "CANDI Pro").

### P2 — Platform expansion (the VAN "My Campaign" half)
6. **CRM side**: volunteers, events/signups, donors, and **survey/canvass questions** (we built the voter side; this is the supporter/donor/volunteer half).
7. **"Import from VAN"** via their API → painless switching = adoption magnet.

### GTM
- Consider a FrontlineHQ-style **transparent, free-through-primary** pricing model for the local market.

## Open follow-ups carried from prior work
- Vote-history export (P0.2) · `voters.email` captured (done) · household (done) · auth hardening (done; finish dashboard settings — email confirm, leaked-password protection, MFA, restrict signups, rotate demo password).

_Prior PRD: Features 1–3 (super-voter filters, filtered-turf, live HQ) — `docs/plans/2026-05-31-van-features-1-3-prd.md` (all shipped)._
