/**
 * CANDI — first-login demo campaign seed.
 *
 * Called by the /select page when a user's personal org has zero campaigns.
 * Uses the service-role client (bypasses RLS) but ALWAYS verifies the target
 * org belongs to the signed-in user before writing anything.
 *
 * Idempotency: presence-gated — callers check campaign count before calling.
 * Safety: never touches org …0001 (shared demo) or …0002 (Easton's org).
 *
 * Returns { campaignId, voterCount, turfCount, contactCount } on success.
 */

import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// ─── Broward bbox (same origin as seed-demo-campaign.mjs) ────────────────────
const WEST = -80.3, SOUTH = 26.1, EAST = -80.1, NORTH = 26.25;

// ─── Deterministic PRNG ───────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Reference data ───────────────────────────────────────────────────────────
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
];
const CITIES = ["Plantation", "Lauderhill", "Sunrise", "Tamarac", "Lauderdale Lakes", "North Lauderdale"];
const ZIPS   = ["33313", "33319", "33322", "33351", "33309", "33311"];
const PRECINCTS = ["D012", "D018", "D024", "D031", "D037", "D044"];
const STREETS = [
  "NW 31st Ave", "Oakland Park Blvd", "Sunrise Blvd", "University Dr", "Pine Island Rd",
  "W Commercial Blvd", "NW 21st Ave", "Nob Hill Rd", "SW 36th St", "Inverrary Blvd",
];
const DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com"];

const RACES: [string, number][] = [
  ["White", 0.36], ["Black", 0.31], ["Hispanic/Latino", 0.22], ["Asian", 0.06], ["Other", 0.05],
];
function pickWeighted(rng: () => number, table: [string, number][]): string {
  let r = rng();
  for (const [val, w] of table) { if (r < w) return val; r -= w; }
  return table[table.length - 1][0];
}

// ─── Voter builder ────────────────────────────────────────────────────────────
const N_VOTERS = 500; // ~500 = fast first-login, still enough for all KPIs

function buildVoters(campaignId: string) {
  const rng = mulberry32(hashSeed(`demo-seed-v1-${campaignId}`));
  const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const idTag = hashSeed(campaignId).toString(36).toUpperCase();

  const rows = [];
  for (let i = 0; i < N_VOTERS; i++) {
    const rp = rng();
    const party = rp < 0.5 ? "D" : rp < 0.85 ? "R" : "I";

    const support = 1 + Math.floor(rng() * 5);
    const persuasion =
      support === 3
        ? 3 + Math.floor(rng() * 3)
        : support <= 2 || support >= 5
          ? Math.floor(rng() * 2)
          : 1 + Math.floor(rng() * 3);

    const age = 18 + Math.floor(rng() * 73);
    const boost = Math.min(age, 80) * 0.0035;
    const history: Record<string, boolean> = {
      "2024G": rng() < 0.42 + boost,
      "2022G": rng() < 0.36 + boost,
      "2020G": rng() < 0.32 + boost,
      "2018G": rng() < 0.28 + boost,
    };
    const got = Object.values(history).filter(Boolean).length;
    const label = `${Math.round((got / 4) * 100)}% (${got}/4)`;

    const flags: string[] = [];
    if (persuasion >= 4) flags.push("persuadable");
    if (rng() < 0.06) flags.push("volunteer");
    if (rng() < 0.05) flags.push("donor");
    if (rng() < 0.12) flags.push("VBM");
    if (rng() < 0.05) flags.push("new");

    const race = pickWeighted(rng, RACES);
    const gb = rng();
    const gender = gb < 0.48 ? "M" : gb < 0.97 ? "F" : "X";

    const first = pick(FIRST);
    const last = pick(LAST);
    const phone = rng() < 0.9
      ? `(954) 555-0${(100 + Math.floor(rng() * 899)).toString().padStart(3, "0")}`
      : null;
    const email = rng() < 0.25
      ? `${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(rng() * 90 + 10)}@${pick(DOMAINS)}`
      : null;

    const lng = WEST + rng() * (EAST - WEST);
    const lat = SOUTH + rng() * (NORTH - SOUTH);

    const regDays = Math.floor(rng() * 3650);
    const regDate = new Date(Date.now() - regDays * 86400000).toISOString().slice(0, 10);

    rows.push({
      campaign_id: campaignId,
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
      // in-memory only for contact builder
      __lng: lng,
      __lat: lat,
    });
  }
  return rows;
}

// ─── Turf builder ─────────────────────────────────────────────────────────────
function rectEWKT(w: number, s: number, e: number, n: number) {
  return `SRID=4326;POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
}

function buildTurfs(campaignId: string, assigneeId: string) {
  const midLng = (WEST + EAST) / 2;
  const midLat = (SOUTH + NORTH) / 2;
  return [
    { name: "Plantation Central",      status: "active",   w: WEST,      s: midLat, e: midLng,    n: NORTH,     assignee: true  },
    { name: "Lauderhill East",         status: "active",   w: midLng,    s: midLat, e: EAST,       n: NORTH,     assignee: true  },
    { name: "Sunrise West",            status: "queued",   w: WEST,      s: SOUTH,  e: midLng,    n: midLat,    assignee: false },
    { name: "University Dr Corridor",  status: "complete", w: WEST+0.02, s: midLat-0.03, e: EAST-0.02, n: midLat+0.03, assignee: false },
  ].map((d) => ({
    campaign_id: campaignId,
    name: d.name,
    status: d.status,
    assignee_id: d.assignee ? assigneeId : null,
    boundary: rectEWKT(d.w, d.s, d.e, d.n),
    door_count: 0,
    voter_count: 0,
    // store rect for count computation (stripped before insert)
    __w: d.w, __s: d.s, __e: d.e, __n: d.n,
  }));
}

// ─── Contact builder ──────────────────────────────────────────────────────────
const N_CONTACTS = 120;

function buildContacts(
  campaignId: string,
  voters: Array<{ __id?: string; __lng: number; __lat: number }>,
  canvasserMembershipId: string
) {
  const rng = mulberry32(hashSeed(`demo-contacts-v1-${campaignId}`));
  const out: object[] = [];
  const now = Date.now();
  const DAY = 86400000;

  for (const v of voters) {
    if (out.length >= N_CONTACTS) break;
    if (rng() > 0.35) continue;

    const rc = rng();
    const channel = rc < 0.78 ? "door" : rc < 0.91 ? "text" : "call";

    const rr = rng();
    let result: string, support: number | null;
    if (rr < 0.24) {
      result = "supporter"; support = 4 + Math.floor(rng() * 2);
    } else if (rr < 0.44) {
      result = "undecided"; support = 3;
    } else if (rr < 0.7) {
      result = "not-home"; support = null;
    } else if (rr < 0.82) {
      result = "refused"; support = Math.floor(rng() * 2);
    } else {
      result = "lit-dropped"; support = 2;
    }

    const dayOffset = Math.floor(Math.pow(rng(), 1.3) * 14);
    const hour = 9 + Math.floor(rng() * 12);
    const minute = Math.floor(rng() * 60);
    let ts = new Date();
    ts.setHours(0, 0, 0, 0);
    const createdAt = Math.min(ts.getTime() - dayOffset * DAY + hour * 3600000 + minute * 60000, now);

    out.push({
      campaign_id: campaignId,
      voter_id: v.__id,
      canvasser_id: canvasserMembershipId,
      channel,
      result,
      support,
      notes: null,
      created_at: new Date(createdAt).toISOString(),
    });
  }
  return out;
}

// ─── Protected org ids ────────────────────────────────────────────────────────
const PROTECTED_ORGS = new Set([
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
]);

// ─── Main export ──────────────────────────────────────────────────────────────
export type SeedResult = {
  campaignId: string;
  voterCount: number;
  turfCount: number;
  contactCount: number;
};

/**
 * Seeds a demo campaign into `orgId`.
 *
 * Security guarantees:
 *  1. Resolves the signed-in user from the regular (RLS) client.
 *  2. Verifies the user is an owner/director in that exact org.
 *  3. Refuses to write into the shared demo orgs (…0001, …0002).
 *  4. Only then uses the admin client to perform the writes.
 */
export async function seedDemoCampaign(orgId: string): Promise<SeedResult> {
  // ── 1. Auth + ownership check (regular, RLS-scoped client) ─────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (PROTECTED_ORGS.has(orgId)) {
    throw new Error("Cannot seed into a shared demo org");
  }

  // Verify the signed-in user is an owner/director in the target org.
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .in("role", ["owner", "director"])
    .maybeSingle();

  if (!membership) {
    throw new Error("User does not own the target org");
  }

  // ── 2. Idempotency guard — one more check right before writing ──────────────
  // (caller already checked, but race-condition safety)
  const admin = createAdminClient();
  const { count } = await admin
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (count && count > 0) {
    // Already has a campaign — return a minimal result so the caller can
    // pick up the existing campaign id.
    const { data: existing } = await admin
      .from("campaigns")
      .select("id")
      .eq("org_id", orgId)
      .limit(1)
      .single();
    return { campaignId: existing!.id as string, voterCount: 0, turfCount: 0, contactCount: 0 };
  }

  // ── 3. Create campaign ──────────────────────────────────────────────────────
  const { data: campaign, error: campaignErr } = await admin
    .from("campaigns")
    .insert({
      org_id: orgId,
      candidate: "Alex Rivera",
      office: "County Commission",
      district: "Broward District 9",
      state: "Florida",
      county: "Broward",
      election_date: "2026-11-03",
      photo_url: null,
    })
    .select("id")
    .single();
  if (campaignErr || !campaign) throw new Error(`Campaign insert failed: ${campaignErr?.message}`);
  const campaignId = campaign.id as string;

  // ── 4. Voters ───────────────────────────────────────────────────────────────
  const voterRows = buildVoters(campaignId);
  // Strip in-memory-only fields before insert
  const voterInsertRows = voterRows.map(({ __lng: _l, __lat: _a, ...rest }) => rest);

  for (let i = 0; i < voterInsertRows.length; i += 200) {
    const { error } = await admin.from("voters").insert(voterInsertRows.slice(i, i + 200));
    if (error) throw new Error(`Voter insert @${i}: ${error.message}`);
  }

  // Re-read inserted ids so contacts can reference voter_id
  const voterIdRows: Array<{ id: string; external_id: string }> = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from("voters")
      .select("id, external_id")
      .eq("campaign_id", campaignId)
      .order("external_id", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(`Voter re-read: ${error.message}`);
    if (!data?.length) break;
    voterIdRows.push(...(data as Array<{ id: string; external_id: string }>));
    if (data.length < 500) break;
  }
  const idByExt = new Map(voterIdRows.map((v) => [v.external_id, v.id]));
  for (const v of voterRows) {
    (v as Record<string, unknown>).__id = idByExt.get(v.external_id);
  }

  // ── 5. Turfs ────────────────────────────────────────────────────────────────
  const turfDefs = buildTurfs(campaignId, membership.id as string);
  const turfInsertRows = turfDefs.map(({ __w: _w, __s: _s, __e: _e, __n: _n, ...rest }) => rest);

  const { data: insertedTurfs, error: turfErr } = await admin
    .from("turfs")
    .insert(turfInsertRows)
    .select("id, name");
  if (turfErr || !insertedTurfs) throw new Error(`Turf insert: ${turfErr?.message}`);

  // Compute voter/door counts from in-memory lng/lat
  for (let i = 0; i < insertedTurfs.length; i++) {
    const td = turfDefs[i];
    const [w, e] = [Math.min(td.__w, td.__e), Math.max(td.__w, td.__e)];
    const [s, n] = [Math.min(td.__s, td.__n), Math.max(td.__s, td.__n)];
    const vc = voterRows.filter((v) => v.__lng >= w && v.__lng <= e && v.__lat >= s && v.__lat <= n).length;
    const dc = Math.round(vc * 0.6);
    await admin.from("turfs").update({ voter_count: vc, door_count: dc }).eq("id", insertedTurfs[i].id);
  }

  // ── 6. Contacts ─────────────────────────────────────────────────────────────
  const contacts = buildContacts(campaignId, voterRows, membership.id as string)
    .filter((c) => (c as Record<string, unknown>).voter_id);

  for (let i = 0; i < contacts.length; i += 200) {
    const { error } = await admin.from("contacts").insert(contacts.slice(i, i + 200));
    if (error) throw new Error(`Contact insert @${i}: ${error.message}`);
  }

  return {
    campaignId,
    voterCount: voterRows.length,
    turfCount: insertedTurfs.length,
    contactCount: contacts.length,
  };
}
