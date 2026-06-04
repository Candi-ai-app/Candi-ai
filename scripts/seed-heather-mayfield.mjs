// CANDI — Heather Mayfield DEMO campaign seed (FULLY SYNTHETIC, safe to commit).
//
// A premium demo campaign designed to make EVERY feature look its best:
//   • 2,000 voters with full demographics, real vote_history (super-voter filter works),
//     support scores, VBM flags, district data (cd/sd/hd), geom pins.
//   • 35 days of contacts with a clear upward trend (impressive knock-velocity chart).
//   • 8 turfs (mixed statuses) with pre-generated walking routes, 2 assigned to
//     canvassers so the Canvassers tab and Field app both work immediately.
//   • ~280 supporters, ~320 VBM-flagged, ~55 doors today.
//
// Campaign: Heather Mayfield | FL State Senate | District 35 | Pompano Beach / Deerfield Beach FL
// Org: demo org (…0001) | Campaign ID: …0050
//
// Run:  node scripts/seed-heather-mayfield.mjs
// Idempotent — clears and re-seeds on re-run.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars in .env.local"); process.exit(1);
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── fixed ids ─────────────────────────────────────────────────────────────────
const ORG_ID      = "00000000-0000-0000-0000-000000000001";
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000050";
const N_VOTERS    = 2000;
const CONTACT_DAYS = 35;

// FL Senate District 35 — Pompano Beach / Deerfield Beach, Broward Co.
const [WEST, SOUTH, EAST, NORTH] = [-80.195, 26.22, -80.065, 26.39];

// ── PRNG ──────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── reference data ────────────────────────────────────────────────────────────
const FIRST = [
  "James","Maria","David","Linda","Andre","Grace","Omar","Chloe","Wei","Tanya",
  "Luis","Nadia","Caleb","Ruth","Diego","Hana","Isaac","Priya","Noah","Zara",
  "Elena","Trent","Maya","Owen","Layla","Marcus","Aaliyah","Kenji","Sofia","Imani",
  "Gabriel","Yara","Devon","Camila","Hassan","Brooke","Mateo","Nina","Reggie","Talia",
  "Jordan","Jasmine","Tyler","Simone","Devin","Carmen","Miles","Fatima","Blake","Rhonda",
];
const LAST = [
  "Nguyen","Carter","Flores","Brooks","Patel","Reed","Murphy","Cohen","Diaz","Walsh",
  "Okafor","Romano","Bauer","Singh","Hughes","Lozano","Foster","Khan","Berg","Ali",
  "Tucker","Mercer","Vance","Ortiz","Hale","Henderson","Whitfield","Raman","Bell","Park",
  "Jacobs","Delgado","Pierre","Sterling","Boyd","Castro","Frazier","Naidu","Levine","Coleman",
  "Watkins","Mosley","Andrade","Winters","Ruiz","Caldwell","Bishop","Newton","Cruz","Powell",
];
// Pompano Beach / Deerfield Beach area
const CITIES = ["Pompano Beach","Deerfield Beach","Lighthouse Point","Coconut Creek","Margate","North Lauderdale"];
const ZIPS   = ["33060","33064","33073","33062","33069","33068","33067"];
const PRECINCTS = ["SD35-A","SD35-B","SD35-C","SD35-D","SD35-E","SD35-F","SD35-G","SD35-H"];
const STREETS = [
  "Sample Rd","Atlantic Blvd","Copans Rd","Hillsboro Blvd","NW 48th Ave",
  "Powerline Rd","Federal Hwy","NE 26th St","Lyons Rd","McNab Rd",
  "NW 31st Ave","Prospect Rd","SW 36th Ave","University Dr","Hammondville Rd",
  "Dixie Hwy","NE 3rd Ave","Oakland Park Blvd","Griffin Rd","Cypress Creek Rd",
];
const DOMAINS = ["gmail.com","yahoo.com","outlook.com","icloud.com","hotmail.com"];
const RACES = [
  ["White",0.42],["Black",0.24],["Hispanic/Latino",0.22],["Asian",0.07],["Other",0.05],
];
function pickWeighted(rng, table) {
  let r = rng();
  for (const [v, w] of table) { if (r < w) return v; r -= w; }
  return table[table.length - 1][0];
}

// ── voter generation ──────────────────────────────────────────────────────────
function buildVoters() {
  const rng = mulberry32(hashSeed("heather-mayfield-demo-050"));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const idTag = hashSeed(CAMPAIGN_ID).toString(36).toUpperCase();
  const rows = [];

  for (let i = 0; i < N_VOTERS; i++) {
    // Party: ~48D/38R/14I (competitive senate district)
    const rp = rng();
    const party = rp < 0.48 ? "D" : rp < 0.86 ? "R" : "I";

    // Age 18–90
    const age = 18 + Math.floor(rng() * 73);

    // Per-election vote history — proper booleans so super-voter N-of-M works.
    // Thresholds tuned: ~30-35% vote in 3-of-4 (a realistic "super-voter" minority).
    const boost = Math.min(age, 80) * 0.003;
    const history = {
      "2024G": rng() < 0.44 + boost,
      "2022G": rng() < 0.38 + boost,
      "2020G": rng() < 0.34 + boost,
      "2018G": rng() < 0.29 + boost,
    };
    const got = Object.values(history).filter(Boolean).length;
    const vote_history = { label: `${Math.round((got/4)*100)}% (${got}/4)`, history };

    // Support 1–5: Democrats lean higher, Republicans lean lower, Independents spread.
    let rawSupport = rng();
    let support;
    if (party === "D")      support = rawSupport < 0.08 ? 1 : rawSupport < 0.18 ? 2 : rawSupport < 0.32 ? 3 : rawSupport < 0.65 ? 4 : 5;
    else if (party === "R") support = rawSupport < 0.35 ? 1 : rawSupport < 0.58 ? 2 : rawSupport < 0.72 ? 3 : rawSupport < 0.88 ? 4 : 5;
    else                    support = rawSupport < 0.12 ? 1 : rawSupport < 0.28 ? 2 : rawSupport < 0.56 ? 3 : rawSupport < 0.8 ? 4 : 5;

    // Persuasion correlated inversely with support (middle scores = most persuadable)
    const persuasion = support === 3 ? 3 + Math.floor(rng() * 3) :
                       support <= 2 || support >= 5 ? Math.floor(rng() * 2) :
                       1 + Math.floor(rng() * 3);

    // Flags
    const flags = [];
    if (persuasion >= 4) flags.push("persuadable");
    if (rng() < 0.16) flags.push("VBM");   // ~320 VBM voters
    if (rng() < 0.07) flags.push("volunteer");
    if (rng() < 0.06) flags.push("donor");
    if (rng() < 0.04) flags.push("new");

    const race = pickWeighted(rng, RACES);
    const gb = rng();
    const gender = gb < 0.48 ? "M" : gb < 0.97 ? "F" : "X";

    const first = pick(FIRST), last = pick(LAST);
    const phone = rng() < 0.88 ? `(954) 555-${(1000 + Math.floor(rng() * 8999)).toString().padStart(4,"0")}` : null;
    const email = rng() < 0.28 ? `${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(rng()*90+10)}@${pick(DOMAINS)}` : null;

    const lng = WEST + rng() * (EAST - WEST);
    const lat = SOUTH + rng() * (NORTH - SOUTH);

    const regDays = Math.floor(rng() * 4380); // 0–12 years
    const regDate = new Date(Date.now() - regDays * 86400000).toISOString().slice(0, 10);

    // Congressional / state / house district data (SD35 area)
    const cd = "22"; // FL-22 covers this area
    const sd = "35";
    const hd = rng() < 0.5 ? "94" : rng() < 0.7 ? "95" : "93";

    rows.push({
      campaign_id: CAMPAIGN_ID,
      external_id: `DEMO-${idTag}-${200000 + i}`,
      first_name: first, last_name: last,
      age, party, race, gender,
      precinct: pick(PRECINCTS),
      address: `${100 + Math.floor(rng() * 9900)} ${pick(STREETS)}`,
      city: pick(CITIES), state: "FL", zip: pick(ZIPS),
      phone, email,
      support, persuasion, vote_history, flags,
      registration_date: regDate,
      cd, sd, hd,
      geom: `SRID=4326;POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`,
    });
  }
  return rows;
}

// ── turfs + routes ────────────────────────────────────────────────────────────
// 8 turfs across the SD35 bbox. 2 active (assigned), 3 queued, 3 complete.
function buildTurfDefs() {
  const midLng = (WEST + EAST) / 2;
  const midLat = (SOUTH + NORTH) / 2;
  const qW = (EAST - WEST) / 4;  // quarter-width
  const qH = (NORTH - SOUTH) / 4;
  return [
    { name: "Pompano Beach North",    status: "active",   w: WEST,         s: midLat,        e: midLng,        n: NORTH,         assign: 0 },
    { name: "Deerfield Beach East",   status: "active",   w: midLng,       s: midLat,        e: EAST,          n: NORTH,         assign: 1 },
    { name: "Sample Road Corridor",   status: "queued",   w: WEST,         s: midLat - qH,   e: EAST,          n: midLat,        assign: null },
    { name: "Atlantic Blvd Strip",    status: "queued",   w: WEST,         s: SOUTH,         e: midLng,        n: midLat - qH,   assign: null },
    { name: "Copans Road Loop",       status: "queued",   w: midLng,       s: SOUTH,         e: EAST,          n: midLat - qH,   assign: null },
    { name: "Powerline Rd Zone",      status: "complete", w: WEST + qW,    s: midLat + qH,   e: EAST - qW,     n: NORTH - qH,    assign: null },
    { name: "Federal Hwy Cluster",    status: "complete", w: midLng - qW,  s: SOUTH + qH,    e: midLng + qW,   n: midLat,        assign: null },
    { name: "McNab Rd Block",         status: "complete", w: WEST,         s: SOUTH,         e: midLng,        n: SOUTH + qH*2,  assign: null },
  ];
}

function rectEWKT(w, s, e, n) {
  return `SRID=4326;POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
}

// Generate a simple walking route (zigzag grid order) for voters inside a rect.
function buildRoute(voterRows, w, s, e, n) {
  const inside = [];
  for (const v of voterRows) {
    const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(v.geom);
    if (!m) continue;
    const [vLng, vLat] = [parseFloat(m[1]), parseFloat(m[2])];
    if (vLng >= w && vLng <= e && vLat >= s && vLat <= n) {
      inside.push({ lng: vLng, lat: vLat, address: v.address, external_id: v.external_id });
    }
  }
  if (inside.length === 0) return null;
  // Dedup by address → one stop per household
  const byAddr = new Map();
  for (const v of inside) {
    const key = v.address.toLowerCase().trim();
    if (!byAddr.has(key)) byAddr.set(key, v);
  }
  const stops = [...byAddr.values()];
  // Zigzag: sort by lat bucket (rows of ~50m), alternate lng direction per row
  const ROW_HEIGHT = 0.0005; // ~55m
  stops.sort((a, b) => {
    const ra = Math.round(a.lat / ROW_HEIGHT), rb = Math.round(b.lat / ROW_HEIGHT);
    if (ra !== rb) return rb - ra; // north first
    return ra % 2 === 0 ? a.lng - b.lng : b.lng - a.lng; // zigzag
  });
  // Return as RouteStop[] JSON (only lat/lng/address — matches the type)
  return stops.slice(0, 80).map((s) => ({ lng: s.lng, lat: s.lat, address: s.address }));
}

// ── contacts (35 days, building trend) ───────────────────────────────────────
function buildContacts(voterRows, canvIds) {
  const rng = mulberry32(hashSeed("heather-mayfield-demo-050-contacts"));
  const out = [];
  const DAY = 86400000;
  const now = Date.now();

  // Target contacts per day: exponential growth from ~8/day to ~55/day over 35d.
  // day 0 = today, day 34 = oldest.
  function targetForDay(daysAgo) {
    // Smooth exponential: 8 * e^(daysAgo/35 * ln(55/8) in reverse)
    // = 8 * (55/8)^((35-daysAgo)/35)
    return Math.round(8 * Math.pow(55 / 8, (CONTACT_DAYS - daysAgo) / CONTACT_DAYS));
  }

  // Assign contacts round-robin across shuffled voters, day by day.
  const voterPool = [...voterRows];
  // Shuffle with the same PRNG for determinism
  for (let i = voterPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [voterPool[i], voterPool[j]] = [voterPool[j], voterPool[i]];
  }
  let vIdx = 0;
  const canvArr = canvIds;

  for (let daysAgo = CONTACT_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const count = targetForDay(daysAgo);
    for (let k = 0; k < count; k++) {
      if (vIdx >= voterPool.length) vIdx = 0;
      const v = voterPool[vIdx++];
      if (!v.__id) continue;

      const rc = rng();
      const channel = rc < 0.74 ? "door" : rc < 0.88 ? "text" : "call";

      const rr = rng();
      let result, support;
      if (rr < 0.26) { result = "supporter"; support = 4 + Math.floor(rng() * 2); }
      else if (rr < 0.42) { result = "undecided"; support = 3; }
      else if (rr < 0.67) { result = "not-home"; support = null; }
      else if (rr < 0.79) { result = "refused"; support = Math.floor(rng() * 2); }
      else { result = "lit-dropped"; support = 2; }

      const hour = 9 + Math.floor(rng() * 11);
      const minute = Math.floor(rng() * 60);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const ts = new Date(dayStart.getTime() - daysAgo * DAY + hour * 3600000 + minute * 60000);
      const createdAt = Math.min(ts.getTime(), now);

      out.push({
        campaign_id: CAMPAIGN_ID,
        voter_id: v.__id,
        canvasser_id: canvArr[Math.floor(rng() * canvArr.length)],
        channel, result,
        support,
        notes: null,
        created_at: new Date(createdAt).toISOString(),
      });
    }
  }
  return out;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("CANDI demo seed → Heather Mayfield (campaign", CAMPAIGN_ID, ")\n");

  // 1) Upsert campaign
  {
    const { error } = await sb.from("campaigns").upsert({
      id: CAMPAIGN_ID, org_id: ORG_ID,
      candidate: "Heather Mayfield",
      office: "State Senate",
      district: "FL Senate District 35",
      state: "Florida", county: "Broward",
      election_date: "2026-11-03",
    }, { onConflict: "id" });
    if (error) throw new Error(`campaign: ${error.message}`);
    console.log("✓ campaign upserted");
  }

  // 2) Resolve memberships: need at least 2 canvassers for demo richness
  let canvIds = [], ownerMembershipId;
  {
    const { data, error } = await sb.from("memberships")
      .select("id, role, user_id, created_at").eq("org_id", ORG_ID)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`memberships: ${error.message}`);
    const canvassers = data.filter((m) => m.role === "canvasser");
    const admins = data.filter((m) => m.role === "owner" || m.role === "director");
    canvIds = canvassers.map((m) => m.id);
    // If only one canvasser, also use the first director/owner as second
    if (canvIds.length < 2 && admins.length > 0) canvIds.push(admins[0].id);
    ownerMembershipId = (admins[0] ?? data[0])?.id;
    console.log(`✓ ${canvIds.length} assignees (${canvassers.length} canvasser, ${admins.length} admin)`);
  }

  // 3) Wipe prior data for this campaign
  {
    await sb.from("contacts").delete().eq("campaign_id", CAMPAIGN_ID);
    await sb.from("turfs").delete().eq("campaign_id", CAMPAIGN_ID);
    await sb.from("voters").delete().eq("campaign_id", CAMPAIGN_ID);
    console.log("✓ cleared prior data");
  }

  // 4) Insert voters in 250-row batches
  const voters = buildVoters();
  for (let i = 0; i < voters.length; i += 250) {
    const { error } = await sb.from("voters").insert(voters.slice(i, i + 250));
    if (error) throw new Error(`voters @${i}: ${error.message}`);
  }
  console.log(`✓ inserted ${voters.length} voters`);

  // 5) Re-read voter IDs
  const voterPts = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("voters").select("id,external_id")
      .eq("campaign_id", CAMPAIGN_ID).range(from, from + 999);
    if (error) throw new Error(`voter read: ${error.message}`);
    voterPts.push(...data);
    if (data.length < 1000) break;
  }
  const idByExt = new Map(voterPts.map((v) => [v.external_id, v.id]));
  for (const v of voters) v.__id = idByExt.get(v.external_id);
  console.log(`✓ mapped ${voterPts.length} voter ids`);

  // 6) Turfs + routes
  const turfDefs = buildTurfDefs();
  const turfRows = turfDefs.map((d, i) => {
    const assignee = d.assign !== null ? (canvIds[d.assign] ?? null) : null;
    return {
      campaign_id: CAMPAIGN_ID, name: d.name, status: d.status,
      assignee_id: assignee,
      boundary: rectEWKT(d.w, d.s, d.e, d.n),
      door_count: 0, voter_count: 0,
    };
  });

  const { data: insertedTurfs, error: turfErr } = await sb.from("turfs").insert(turfRows).select("id,name");
  if (turfErr) throw new Error(`turfs: ${turfErr.message}`);
  console.log(`✓ inserted ${insertedTurfs.length} turfs`);

  // Compute counts + generate routes per turf
  for (let i = 0; i < turfDefs.length; i++) {
    const d = turfDefs[i];
    const route = buildRoute(voters, d.w, d.s, d.e, d.n);
    const voterCount = route ? route.length : 0;
    const doorCount = Math.round(voterCount * (0.55 + 0.08 * (i % 4)));
    const { error } = await sb.from("turfs")
      .update({ voter_count: voterCount, door_count: doorCount, route: route })
      .eq("id", insertedTurfs[i].id);
    if (error) throw new Error(`turf update ${d.name}: ${error.message}`);
    process.stdout.write(`\r   routes: ${i + 1}/${turfDefs.length}`);
  }
  console.log("\n✓ turf counts + routes set");

  // 7) Contacts (35-day building trend)
  const contacts = buildContacts(voters, canvIds).filter((c) => c.voter_id);
  for (let i = 0; i < contacts.length; i += 250) {
    const { error } = await sb.from("contacts").insert(contacts.slice(i, i + 250));
    if (error) throw new Error(`contacts @${i}: ${error.message}`);
  }
  console.log(`✓ inserted ${contacts.length} contacts over ${CONTACT_DAYS} days`);

  // 8) Summary
  const supporters = voters.filter((v) => (v.support ?? 0) >= 4).length;
  const vbm = voters.filter((v) => v.flags.includes("VBM")).length;
  const superVoters = voters.filter((v) => {
    const h = v.vote_history.history;
    return Object.values(h).filter(Boolean).length >= 3;
  }).length;
  const todayContacts = contacts.filter((c) => {
    const d = new Date(); d.setHours(0,0,0,0);
    return new Date(c.created_at) >= d;
  }).length;

  console.log("\n── Demo stats ──────────────────────────────────────────────");
  console.log(`  Voters:        ${voters.length.toLocaleString()}`);
  console.log(`  Supporters 4–5: ${supporters.toLocaleString()} (${Math.round(supporters/voters.length*100)}%)`);
  console.log(`  VBM-flagged:   ${vbm.toLocaleString()} (${Math.round(vbm/voters.length*100)}%)`);
  console.log(`  Super-voters 3/4: ${superVoters.toLocaleString()} (${Math.round(superVoters/voters.length*100)}%)`);
  console.log(`  Total contacts: ${contacts.length.toLocaleString()} over ${CONTACT_DAYS} days`);
  console.log(`  Doors today:   ~${todayContacts}`);
  console.log(`  Turfs:         ${insertedTurfs.length} (2 active w/ routes + assignees, 3 queued, 3 complete)`);
  console.log("────────────────────────────────────────────────────────────");
  console.log("\n✅ Heather Mayfield demo seed complete.");
}

main().catch((e) => { console.error("\n✗ seed failed:", e.message); process.exit(1); });
