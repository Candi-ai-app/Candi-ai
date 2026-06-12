// CANDI — refresh-demo-live.mjs
//
// Makes the Heather Mayfield demo campaign look "live" right before a partner demo.
//
// What it does:
//   1. Upserts canvasser_locations for the 2 active-turf assignees → status "active",
//      updated_at = now(), coords near each turf (tiny random jitter so reruns move them).
//   2. Inserts ~10–14 door contacts dated within the last 2 hours, spread across
//      real voters from the campaign.  Safe to run repeatedly — locations upsert;
//      contacts just accumulate (today's count is printed so reruns don't surprise).
//   3. Heather Mayfield campaign ONLY (hard-coded campaign id …0050).
//
// Run:
//   PG_MODULE=/tmp/candi-pg/node_modules/pg/lib/index.js node scripts/refresh-demo-live.mjs
//   (or just: node scripts/refresh-demo-live.mjs  — PG_MODULE falls back to
//    /tmp/candi-pg/node_modules/pg/lib/index.js automatically if present)
//
// Requires: DATABASE_URL in .env.local (password may be wrapped in [brackets] —
//           stripped automatically, matching the import-precincts.mjs convention).
//
// Does NOT touch package.json or repo dependencies.

import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

// ── config ────────────────────────────────────────────────────────────────────
const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000050";
const ORG_ID      = "00000000-0000-0000-0000-000000000001";

// Turf 0 "Pompano Beach North" centre (NW quadrant of SD35 bbox):
//   W=-80.195 S=26.305 E=-80.13 N=26.39
const TURF0_CENTER = { lng: -80.163, lat: 26.348 };

// Turf 1 "Deerfield Beach East" centre (NE quadrant of SD35 bbox):
//   W=-80.13 S=26.305 E=-80.065 N=26.39
const TURF1_CENTER = { lng: -80.098, lat: 26.348 };

// Result/support combos that match the seed script's contact population.
const DOOR_OUTCOMES = [
  { result: "supporter",  support: 4 },
  { result: "supporter",  support: 5 },
  { result: "undecided",  support: 3 },
  { result: "not-home",   support: null },
  { result: "not-home",   support: null },
  { result: "refused",    support: 1 },
  { result: "lit-dropped", support: 2 },
  { result: "supporter",  support: 4 },
  { result: "undecided",  support: 3 },
  { result: "not-home",   support: null },
  { result: "supporter",  support: 5 },
  { result: "not-home",   support: null },
];

// Notes format: " | turf:<id> | address:<addr>" appended by the field app.
// The turf IDs are not known at script write-time; we fill them in after
// querying the DB.  If no turf id is available we omit the tag.

// ── env / pg setup ─────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

if (!env.DATABASE_URL) {
  console.error("❌  DATABASE_URL not found in .env.local");
  process.exit(1);
}

// Resolve pg module — prefer PG_MODULE env var, then fall back to /tmp/candi-pg.
const PG_MODULE =
  process.env.PG_MODULE ||
  (existsSync("/tmp/candi-pg/node_modules/pg/lib/index.js")
    ? "/tmp/candi-pg/node_modules/pg/lib/index.js"
    : "pg");

let pgMod;
try {
  pgMod = await import(PG_MODULE);
} catch {
  console.error(
    `❌  Cannot load pg driver from: ${PG_MODULE}\n` +
    "    Stage it with:\n" +
    "      mkdir -p /tmp/candi-pg && cd /tmp/candi-pg && npm init -y && npm install pg\n" +
    "    then re-run."
  );
  process.exit(1);
}
const pg = pgMod.default ?? pgMod;

// Parse DATABASE_URL, stripping [bracket]-wrapped passwords.
const m = env.DATABASE_URL.match(
  /^postgresql:\/\/([^:]+):(.+)@([^@]+):(\d+)\/(.+)$/
);
if (!m) {
  console.error("❌  Unparseable DATABASE_URL in .env.local");
  process.exit(1);
}
const client = new pg.Client({
  host: m[3],
  port: Number(m[4]),
  user: m[1],
  database: m[5],
  password: m[2].replace(/^\[|\]$/g, ""), // strip template [brackets]
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// ── helpers ────────────────────────────────────────────────────────────────
// Tiny deterministic-ish jitter so each run moves the pins a little.
// Uses current second-of-minute as seed (0–59) → ±0.0004° (~44m).
const jitterSeed = new Date().getSeconds();
function jitter(n) {
  // simple LCG seeded on n + jitterSeed
  const v = ((n * 1664525 + jitterSeed * 22695477 + 1013904223) >>> 0) / 0xffffffff;
  return (v - 0.5) * 0.0008; // ±0.0004°
}

// ── step 1: resolve the 2 active-turf assignee membership ids ─────────────
console.log("\n── Heather Mayfield demo refresh ─────────────────────────────");
console.log(`   campaign: ${CAMPAIGN_ID}\n`);

// The seed assigns turfs in order: canvIds[0] → Pompano Beach North,
// canvIds[1] → Deerfield Beach East.
// canvIds is built as: canvassers (by created_at asc) + first admin if < 2 canvassers.
const { rows: memberRows } = await client.query(
  `select id, role, created_at
   from public.memberships
   where org_id = $1
   order by
     case when role = 'canvasser' then 0 else 1 end,
     created_at asc`,
  [ORG_ID]
);

const canvassers = memberRows.filter((r) => r.role === "canvasser");
const admins     = memberRows.filter((r) => r.role !== "canvasser");
let canvIds = canvassers.map((r) => r.id);
if (canvIds.length < 2 && admins.length > 0) canvIds.push(admins[0].id);

if (canvIds.length < 2) {
  console.error(`❌  Need at least 2 memberships in org ${ORG_ID}; found ${canvIds.length}`);
  await client.end();
  process.exit(1);
}
const [mid0, mid1] = canvIds;
console.log(`   Canvasser 0 (Pompano Beach North):   ${mid0}`);
console.log(`   Canvasser 1 (Deerfield Beach East): ${mid1}`);

// ── step 2: fetch the active turf IDs so we can embed turf: in notes ──────
const { rows: turfRows } = await client.query(
  `select id, name, assignee_id
   from public.turfs
   where campaign_id = $1
     and status = 'active'
   order by name`,
  [CAMPAIGN_ID]
);

// Map assignee_id → turf id
const turfByAssignee = {};
for (const t of turfRows) {
  if (t.assignee_id) turfByAssignee[t.assignee_id] = t.id;
}
console.log(`   Active turfs found: ${turfRows.map((t) => t.name).join(", ")}`);

// ── step 3: upsert canvasser_locations ────────────────────────────────────
const now = new Date().toISOString();

const locationUpserts = [
  { mid: mid0, center: TURF0_CENTER, jSeed: 1 },
  { mid: mid1, center: TURF1_CENTER, jSeed: 2 },
];

for (const { mid, center, jSeed } of locationUpserts) {
  const lng = center.lng + jitter(jSeed);
  const lat = center.lat + jitter(jSeed + 100);
  await client.query(
    `insert into public.canvasser_locations
       (membership_id, campaign_id, lng, lat, accuracy, status, updated_at)
     values ($1, $2, $3, $4, $5, 'active', now())
     on conflict (membership_id)
     do update set
       campaign_id = excluded.campaign_id,
       lng         = excluded.lng,
       lat         = excluded.lat,
       accuracy    = excluded.accuracy,
       status      = 'active',
       updated_at  = now()`,
    [mid, CAMPAIGN_ID, lng, lat, 8 + Math.random() * 4]
  );
}
console.log("✓  canvasser_locations upserted (status=active, updated_at=now)");

// ── step 4: sample real voters from this campaign ─────────────────────────
// Pull 200 voters to give us a healthy pool to pick from.
const { rows: voterSample } = await client.query(
  `select id from public.voters
   where campaign_id = $1
   order by random()
   limit 200`,
  [CAMPAIGN_ID]
);

if (voterSample.length === 0) {
  console.error("❌  No voters found for this campaign — run the seed first.");
  await client.end();
  process.exit(1);
}
console.log(`   Voter pool: ${voterSample.length} sampled`);

// ── step 5: insert ~10–14 door contacts in the last 2 hours ───────────────
const contactCount = 10 + Math.floor(Math.random() * 5); // 10–14
const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
const contacts = [];

for (let i = 0; i < contactCount; i++) {
  const outcome = DOOR_OUTCOMES[i % DOOR_OUTCOMES.length];
  const voter   = voterSample[Math.floor(Math.random() * voterSample.length)];

  // Spread timestamps randomly across the last 2 hours
  const ts = new Date(twoHoursAgo + Math.random() * (Date.now() - twoHoursAgo));

  // Alternate between the two canvassers
  const canvId  = i % 2 === 0 ? mid0 : mid1;
  const turfId  = turfByAssignee[canvId] ?? null;

  // Build the notes in the field-app format: "| turf:<id> | address:<addr>"
  // Use a synthetic address so it reads naturally in the voter timeline.
  const addr = `${1000 + Math.floor(Math.random() * 8000)} ${
    ["Sample Rd", "Atlantic Blvd", "Copans Rd", "Hillsboro Blvd", "Powerline Rd"][i % 5]
  }`;
  const noteParts = [
    ...(turfId ? [`turf:${turfId}`] : []),
    `address:${addr}`,
  ];
  const notes = noteParts.length ? " | " + noteParts.join(" | ") : null;

  contacts.push({ voter_id: voter.id, canvId, turfId, ts, notes, outcome });
}

// Insert one by one to keep timestamps distinct (no batch constraint on ts).
for (const c of contacts) {
  await client.query(
    `insert into public.contacts
       (campaign_id, voter_id, canvasser_id, channel, result, support, notes, created_at)
     values ($1, $2, $3, 'door', $4, $5, $6, $7)`,
    [CAMPAIGN_ID, c.voter_id, c.canvId, c.outcome.result, c.outcome.support, c.notes, c.ts]
  );
}
console.log(`✓  inserted ${contacts.length} door contacts (spread over last 2 h)`);

// ── step 6: summary ────────────────────────────────────────────────────────
const { rows: locRows } = await client.query(
  `select membership_id, status, updated_at
   from public.canvasser_locations
   where campaign_id = $1
   order by updated_at desc`,
  [CAMPAIGN_ID]
);

const { rows: todayRows } = await client.query(
  `select count(*)::int as n
   from public.contacts
   where campaign_id = $1
     and channel = 'door'
     and created_at >= date_trunc('day', now())`,
  [CAMPAIGN_ID]
);

console.log("\n── Summary ───────────────────────────────────────────────────");
console.log("  Canvasser locations:");
for (const r of locRows) {
  console.log(
    `    ${r.membership_id}  status=${r.status}  updated_at=${new Date(r.updated_at).toISOString()}`
  );
}
console.log(`  Door contacts today: ${todayRows[0].n}`);
console.log("──────────────────────────────────────────────────────────────");
console.log("✅  Demo is live.");

await client.end();
