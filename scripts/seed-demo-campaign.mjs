// CANDI — DEMO campaign seed (FULLY SYNTHETIC, safe to commit + demo on).
//
// Builds a polished, fictional campaign so EVERY feature works in a live
// walkthrough WITHOUT ever touching real voter PII. Candidate "Maya Chen",
// County Commission, Broward District 7, FL. Fixed ids → idempotent re-runs.
//
// Run:  node scripts/seed-demo-campaign.mjs
// Uses SUPABASE_SERVICE_ROLE_KEY from .env.local (service-role client, like
// scripts/seed-users.mjs). Service-role bypasses RLS so we can write + verify
// directly; the data we write is 100% generated, so this is just demo seeding.
//
// What it creates in the demo org (…0001) on campaign …0040:
//   • ~1,500 deterministic voters with the FULL field set (party/race/gender/
//     age/precinct/address/geom/support/persuasion/flags + per-election
//     vote_history.history so the super-voter 3-of-4 filter returns a real count).
//   • ~6 turfs (mixed status, polygons in a Broward bbox, 2 assigned to the
//     canvasser membership).
//   • ~400 contacts over the last 14 days (incl. today) so HQ KPIs + the
//     knock-velocity chart + "canvassers in field" all populate.
//
// Idempotent: upserts the campaign on id, and wipes THIS campaign's
// voters/turfs/contacts before re-seeding (so re-runs give exact counts, not
// duplicates). Deterministic PRNG → stable values across runs.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env ───────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── fixed ids (idempotent) ─────────────────────────────────────────────────────
const ORG_ID = "00000000-0000-0000-0000-000000000001"; // demo org
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000040";
const N_VOTERS = 1500;
const N_CONTACTS_TARGET = 400;

// Broward bbox the task fixed for the demo (tighter than lib/areas.ts so the
// turf map pins + polygons line up): [west, south, east, north].
const BBOX = [-80.3, 26.1, -80.1, 26.25];
const [WEST, SOUTH, EAST, NORTH] = BBOX;

// ── deterministic PRNG (mirrors app/select/actions.ts) ─────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── reference data (Broward-flavored, synthetic) ───────────────────────────────
const FIRST = [
  "James", "Maria", "David", "Linda", "Andre", "Grace", "Omar", "Chloe", "Wei", "Tanya",
  "Luis", "Nadia", "Caleb", "Ruth", "Diego", "Hana", "Isaac", "Priya", "Noah", "Zara",
  "Elena", "Trent", "Maya", "Owen", "Layla", "Marcus", "Aaliyah", "Kenji", "Sofia", "Imani",
  "Gabriel", "Yara", "Devon", "Camila", "Hassan", "Brooke", "Mateo", "Nina", "Reggie", "Talia",
];
const LAST = [
  "Nguyen", "Carter", "Flores", "Brooks", "Patel", "Reed", "Murphy", "Cohen", "Diaz", "Walsh",
  "Okafor", "Romano", "Bauer", "Singh", "Hughes", "Lozano", "Foster", "Khan", "Berg", "Ali",
  "Tucker", "Mercer", "Vance", "Ortiz", "Hale", "Henderson", "Whitfield", "Raman", "Bell", "Park",
  "Jacobs", "Delgado", "Pierre", "Sterling", "Boyd", "Castro", "Frazier", "Naidu", "Levine", "Coleman",
];
// Broward District 7-flavored cities + zips (synthetic, plausible).
const CITIES = ["Plantation", "Lauderhill", "Sunrise", "Tamarac", "Lauderdale Lakes", "North Lauderdale"];
const ZIPS = ["33313", "33319", "33322", "33351", "33309", "33311"];
const PRECINCTS = ["D012", "D018", "D024", "D031", "D037", "D044"]; // ~6 precincts
const STREETS = [
  "NW 31st Ave", "Oakland Park Blvd", "Sunrise Blvd", "University Dr", "Pine Island Rd",
  "W Commercial Blvd", "NW 21st Ave", "Nob Hill Rd", "SW 36th St", "Inverrary Blvd",
  "Cleary Blvd", "NW 44th St", "State Road 7", "Broward Blvd", "Peters Rd",
];
const DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com", "aol.com"];

const RACES = [
  ["White", 0.36],
  ["Black", 0.31],
  ["Hispanic/Latino", 0.22],
  ["Asian", 0.06],
  ["Other", 0.05],
];
function pickWeighted(rng, table) {
  let r = rng();
  for (const [val, w] of table) {
    if (r < w) return val;
    r -= w;
  }
  return table[table.length - 1][0];
}

// ── voter generation ────────────────────────────────────────────────────────────
function buildVoters() {
  const rng = mulberry32(hashSeed("maya-chen-demo-040"));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const idTag = hashSeed(CAMPAIGN_ID).toString(36).toUpperCase();

  const rows = [];
  for (let i = 0; i < N_VOTERS; i++) {
    // Party mix ~50/35/15 D/R/I (task spec).
    const rp = rng();
    const party = rp < 0.5 ? "D" : rp < 0.85 ? "R" : "I";

    // Support 1–5, spread across all buckets (NOT all null) so the support
    // facet + "Supporters ID'd (4–5)" KPI populate.
    const support = 1 + Math.floor(rng() * 5);
    // Persuasion correlated with support (mirrors actions.ts).
    const persuasion =
      support === 3
        ? 3 + Math.floor(rng() * 3)
        : support <= 2 || support >= 5
          ? Math.floor(rng() * 2)
          : 1 + Math.floor(rng() * 3);

    const age = 18 + Math.floor(rng() * 73); // 18–90 (task spec)

    // Per-election turnout, most-recent-first, age-boosted so older voters vote
    // more. Stored under vote_history.history with EXACT codes the super-voter
    // RPC reads (`-> 'history' ->> '2024G' = 'true'`). Thresholds tuned so the
    // 3-of-4 super-voter set lands as a realistic minority (~one third) rather
    // than a majority — mirrors the demographics migration's intent.
    const boost = Math.min(age, 80) * 0.0035;
    const history = {
      "2024G": rng() < 0.42 + boost,
      "2022G": rng() < 0.36 + boost,
      "2020G": rng() < 0.32 + boost,
      "2018G": rng() < 0.28 + boost,
    };
    const got = Object.values(history).filter(Boolean).length;
    const label = `${Math.round((got / 4) * 100)}% (${got}/4)`;

    // Flags: persuadable / volunteer / donor / VBM / new (task spec).
    const flags = [];
    if (persuasion >= 4) flags.push("persuadable");
    if (rng() < 0.06) flags.push("volunteer");
    if (rng() < 0.05) flags.push("donor");
    if (rng() < 0.12) flags.push("VBM"); // a bit higher so the VBM KPI is visibly non-trivial
    if (rng() < 0.05) flags.push("new");

    const race = pickWeighted(rng, RACES);
    const gb = rng();
    const gender = gb < 0.48 ? "M" : gb < 0.97 ? "F" : "X";

    // Most voters have a phone; ~25% have an email (task spec).
    const first = pick(FIRST);
    const last = pick(LAST);
    const hasPhone = rng() < 0.9;
    const hasEmail = rng() < 0.25;
    const phone = hasPhone
      ? `(954) 555-0${(100 + Math.floor(rng() * 899)).toString().padStart(3, "0")}`
      : null;
    const email = hasEmail
      ? `${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(rng() * 90 + 10)}@${pick(DOMAINS)}`
      : null;

    // Point within the Broward bbox so turf-map pins render.
    const lng = WEST + rng() * (EAST - WEST);
    const lat = SOUTH + rng() * (NORTH - SOUTH);

    // Registration date 0–10y ago (column exists from voter_demographics).
    const regDays = Math.floor(rng() * 3650);
    const regDate = new Date(Date.now() - regDays * 86400000).toISOString().slice(0, 10);

    rows.push({
      campaign_id: CAMPAIGN_ID,
      external_id: `DEMO-${idTag}-${100000 + i}`,
      first_name: first,
      last_name: last,
      age,
      party,
      precinct: pick(PRECINCTS),
      address: `${100 + Math.floor(rng() * 8900)} ${pick(STREETS)}`,
      city: pick(CITIES),
      state: "FL",
      zip: pick(ZIPS),
      phone,
      email,
      support,
      persuasion,
      vote_history: { label, history },
      flags,
      race,
      gender,
      registration_date: regDate,
      geom: `SRID=4326;POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`,
    });
  }
  return rows;
}

// ── turf polygons (EWKT) ─────────────────────────────────────────────────────────
// Six rectangular turfs tiled across the bbox. One is deliberately wide so it
// reliably contains a cluster of voter points (verification: a polygon contains
// some voters). Mixed statuses; canvasser gets 2.
function rectEWKT(w, s, e, n) {
  // Closed ring, lng lat order, SRID 4326.
  return `SRID=4326;POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
}
function buildTurfs(canvasserMembershipId) {
  const W = WEST, S = SOUTH, E = EAST, N = NORTH;
  const midLng = (W + E) / 2;
  const midLat = (S + N) / 2;
  // A few overlapping/tiled rectangles inside the bbox.
  const defs = [
    { name: "Plantation Central", status: "active", w: W, s: midLat, e: midLng, n: N },
    { name: "Lauderhill East", status: "active", w: midLng, s: midLat, e: E, n: N },
    { name: "Sunrise West", status: "queued", w: W, s: S, e: midLng, n: midLat },
    { name: "Tamarac North", status: "queued", w: midLng, s: S, e: E, n: midLat },
    // Wide center band — guaranteed to overlap a dense slice of points.
    { name: "University Dr Corridor", status: "complete", w: W + 0.02, s: midLat - 0.03, e: E - 0.02, n: midLat + 0.03 },
    { name: "Inverrary Loop", status: "complete", w: midLng - 0.03, s: S + 0.02, e: midLng + 0.03, n: N - 0.02 },
  ];
  return defs.map((d, i) => ({
    campaign_id: CAMPAIGN_ID,
    name: d.name,
    status: d.status,
    // Assign the first two turfs to the canvasser membership (task spec).
    assignee_id: i < 2 ? canvasserMembershipId : null,
    boundary: rectEWKT(d.w, d.s, d.e, d.n),
    // door/voter counts are filled after we know how many voters fall inside.
    door_count: 0,
    voter_count: 0,
  }));
}

// ── contacts (last 14 days incl. today) ────────────────────────────────────────
function buildContacts(voterRows, canvasserMembershipId) {
  const rng = mulberry32(hashSeed("maya-chen-demo-040-contacts"));
  const out = [];
  const now = Date.now();
  const DAY = 86400000;

  // Walk voters; give a subset 1–3 contacts. Stop once we hit the target so the
  // total lands near ~400 with a healthy spread.
  for (const v of voterRows) {
    if (out.length >= N_CONTACTS_TARGET) break;
    if (rng() > 0.32) continue; // ~32% of voters touched → ~400 over 1500
    const slots = 1 + (rng() < 0.25 ? 1 : 0) + (rng() < 0.08 ? 1 : 0); // mostly 1
    for (let s = 0; s < slots && out.length < N_CONTACTS_TARGET; s++) {
      // Channel: ~78% door, ~13% text, ~9% call (mirrors seed_contacts.sql).
      const rc = rng();
      const channel = rc < 0.78 ? "door" : rc < 0.91 ? "text" : "call";

      // Result + correlated support (doors that reach a voter ID support).
      const rr = rng();
      let result, csupport;
      if (channel !== "door" && rr < 0.45) {
        result = "not-home";
        csupport = null;
      } else if (rr < 0.24) {
        result = "supporter";
        csupport = 4 + Math.floor(rng() * 2); // 4–5
      } else if (rr < 0.44) {
        result = "undecided";
        csupport = 3;
      } else if (rr < 0.7) {
        result = "not-home";
        csupport = null;
      } else if (rr < 0.82) {
        result = "refused";
        csupport = Math.floor(rng() * 2); // 0–1
      } else {
        result = "lit-dropped";
        csupport = 2;
      }

      // Day offset 0..13 weighted toward recent, with a slice landing TODAY.
      const dayOffset = Math.floor(Math.pow(rng(), 1.3) * 14); // 0..13
      const hour = 9 + Math.floor(rng() * 12); // 9:00–20:59
      const minute = Math.floor(rng() * 60);
      let ts = new Date();
      ts.setHours(0, 0, 0, 0);
      ts = new Date(ts.getTime() - dayOffset * DAY + hour * 3600000 + minute * 60000);
      // Never let "today" rows land in the future.
      const createdAt = Math.min(ts.getTime(), now);

      out.push({
        campaign_id: CAMPAIGN_ID,
        voter_id: v.__id, // resolved after insert
        canvasser_id: canvasserMembershipId,
        channel,
        result,
        support: csupport,
        notes: null,
        created_at: new Date(createdAt).toISOString(),
      });
    }
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("CANDI demo seed → campaign", CAMPAIGN_ID, "(Maya Chen)\n");

  // 1) Upsert the campaign (idempotent on id).
  const campaign = {
    id: CAMPAIGN_ID,
    org_id: ORG_ID,
    candidate: "Maya Chen",
    office: "County Commission",
    district: "Broward District 7",
    state: "Florida",
    county: "Broward",
    election_date: "2026-11-03",
  };
  {
    const { error } = await sb.from("campaigns").upsert(campaign, { onConflict: "id" });
    if (error) throw new Error(`campaign upsert: ${error.message}`);
    console.log("✓ campaign upserted");
  }

  // 2) Resolve the canvasser membership in the demo org (assignee for turfs +
  //    contacts). Prefer role='canvasser'; fall back to any membership.
  let canvasserMembershipId;
  {
    const { data, error } = await sb
      .from("memberships")
      .select("id, role, created_at")
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`memberships: ${error.message}`);
    const canv = data.find((m) => m.role === "canvasser") ?? data[0];
    if (!canv) throw new Error("no membership in demo org to assign as canvasser");
    canvasserMembershipId = canv.id;
    console.log("✓ canvasser membership:", canvasserMembershipId, `(role=${canv.role ?? "?"})`);
  }

  // 3) Wipe THIS campaign's children so re-runs give exact counts (contacts →
  //    via voters cascade, but delete explicitly to be safe + clear turfs).
  {
    await sb.from("contacts").delete().eq("campaign_id", CAMPAIGN_ID);
    await sb.from("turfs").delete().eq("campaign_id", CAMPAIGN_ID);
    await sb.from("voters").delete().eq("campaign_id", CAMPAIGN_ID);
    console.log("✓ cleared prior demo voters/turfs/contacts for", CAMPAIGN_ID);
  }

  // 4) Insert voters in batches.
  const voters = buildVoters();
  for (let i = 0; i < voters.length; i += 250) {
    const { error } = await sb.from("voters").insert(voters.slice(i, i + 250));
    if (error) throw new Error(`voters insert @${i}: ${error.message}`);
  }
  console.log(`✓ inserted ${voters.length} voters`);

  // Re-read inserted voters (id + lng/lat) so contacts can reference voter_id and
  // turf counts can be computed from real points.
  const voterPts = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("voters")
        .select("id, external_id, support")
        .eq("campaign_id", CAMPAIGN_ID)
        .order("external_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`voters read: ${error.message}`);
      if (!data.length) break;
      voterPts.push(...data);
      if (data.length < PAGE) break;
    }
  }
  // Map external_id → id, and attach ids onto our in-memory rows (they share order
  // via external_id) so the contact builder can reference them.
  const idByExt = new Map(voterPts.map((v) => [v.external_id, v.id]));
  for (const v of voters) v.__id = idByExt.get(v.external_id);

  // 5) Turfs. Insert, then compute door/voter counts from the EWKT polygons by
  //    asking PostGIS how many voter points fall inside each (via an RPC-free
  //    count using ST_Contains over the geom column).
  const turfs = buildTurfs(canvasserMembershipId);
  const { data: insertedTurfs, error: turfErr } = await sb
    .from("turfs")
    .insert(turfs)
    .select("id, name, boundary");
  if (turfErr) throw new Error(`turfs insert: ${turfErr.message}`);
  console.log(`✓ inserted ${insertedTurfs.length} turfs`);

  // Compute voter_count per turf using a server-side spatial count. We reuse the
  // existing turf-counts RPC if present; otherwise fall back to a local count
  // using the voter points we read (parsed from geom is unavailable here, so we
  // recompute lng/lat from our in-memory generator rows, which match the DB).
  // Build lng/lat for each voter from the EWKT we generated.
  const llByExt = new Map();
  for (const v of voters) {
    const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(v.geom);
    if (m) llByExt.set(v.external_id, [parseFloat(m[1]), parseFloat(m[2])]);
  }
  const allLL = [...llByExt.values()];
  function countInRect(w, s, e, n) {
    let c = 0;
    for (const [lng, lat] of allLL) if (lng >= w && lng <= e && lat >= s && lat <= n) c++;
    return c;
  }
  // Re-derive each turf's rect from its definition order (insertedTurfs preserves
  // insert order) to compute counts, then update door/voter counts.
  const turfDefs = buildTurfs(canvasserMembershipId); // same rects, deterministic
  for (let i = 0; i < insertedTurfs.length; i++) {
    const m = /POLYGON\(\(([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+)/.exec(
      turfDefs[i].boundary
    );
    // ring: (w s, e s, e n, w n, w s) → w=x1,s=y1,e=x3,n=y5/y6
    const w = parseFloat(m[1]), s = parseFloat(m[2]), e = parseFloat(m[3]);
    const n = parseFloat(/, ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+)\)\)/.exec(turfDefs[i].boundary)[2]);
    const vc = countInRect(Math.min(w, e), Math.min(s, n), Math.max(w, e), Math.max(s, n));
    const dc = Math.round(vc * (0.55 + 0.1 * (i % 3))); // doors ≈ a fraction of voters (households)
    const { error } = await sb
      .from("turfs")
      .update({ voter_count: vc, door_count: dc })
      .eq("id", insertedTurfs[i].id);
    if (error) throw new Error(`turf count update: ${error.message}`);
  }
  console.log("✓ turf voter/door counts set");

  // 6) Contacts.
  const contacts = buildContacts(voters, canvasserMembershipId).filter((c) => c.voter_id);
  for (let i = 0; i < contacts.length; i += 250) {
    const { error } = await sb.from("contacts").insert(contacts.slice(i, i + 250));
    if (error) throw new Error(`contacts insert @${i}: ${error.message}`);
  }
  console.log(`✓ inserted ${contacts.length} contacts`);

  console.log("\nDone. Run scripts/verify-demo-campaign.mjs to validate against the live DB.");
}

main().catch((e) => {
  console.error("\n✗ seed failed:", e.message);
  process.exit(1);
});
