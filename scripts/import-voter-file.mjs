// Import a Florida Supervisor-of-Elections voter export (.xlsx) into CANDI.
//
// Reusable + data-free: takes the xlsx path and a campaign id as args. Contains
// NO embedded voter data. Parses with python/openpyxl (read-only), Census-batch-
// geocodes active voters, and upserts an idempotent campaign + voters into Supabase
// via the service-role key (same pattern as scripts/seed-users.mjs).
//
// Usage:
//   node scripts/import-voter-file.mjs <path/to/file.xlsx> [campaignId]
//
// Options (env or flags):
//   --campaign=<uuid>     target campaign id (default 00000000-0000-0000-0000-000000000030)
//   --candidate="Name"    campaign candidate name      (default "Easton Harrison")
//   --office="..."        campaign office              (default "County Commission")
//   --district="..."      campaign district            (default "Broward District 9")
//   --state="..."         campaign state               (default "Florida")
//   --county="..."        campaign county              (default "Broward")
//   --election-date=YYYY-MM-DD  (default 2026-11-03)
//   --org=<uuid>          owning org                   (default demo org …0001)
//   --no-geocode          skip Census geocoding (import with geom = null)
//   --limit=N             only process the first N data rows (debugging)
//
// PII SAFETY: the source xlsx, geocode CSVs, and parsed rows are PII. Intermediate
// files live only in os.tmpdir() and are deleted in a finally{} block. Console
// output is masked (counts + masked samples only). Never commit any of these files.

import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const i = a.indexOf("=");
      return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
    })
);

const XLSX_PATH = positional[0] ?? flags.file;
if (!XLSX_PATH) {
  console.error("Usage: node scripts/import-voter-file.mjs <file.xlsx> [campaignId]");
  process.exit(1);
}
if (!existsSync(XLSX_PATH)) {
  console.error(`✗ file not found: ${XLSX_PATH}`);
  process.exit(1);
}

const CAMPAIGN_ID =
  positional[1] ?? flags.campaign ?? "00000000-0000-0000-0000-000000000030";
const ORG_ID = flags.org ?? "00000000-0000-0000-0000-000000000001";
const CAMPAIGN = {
  id: CAMPAIGN_ID,
  org_id: ORG_ID,
  candidate: flags.candidate ?? "Easton Harrison",
  office: flags.office ?? "County Commission",
  district: flags.district ?? "Broward District 9",
  state: flags.state ?? "Florida",
  county: flags.county ?? "Broward",
  election_date: flags["election-date"] ?? "2026-11-03",
};
const DO_GEOCODE = !flags["no-geocode"];
const LIMIT = flags.limit ? Number(flags.limit) : null;

// ── env / supabase (service role, like seed-users.mjs) ───────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── mapping helpers ──────────────────────────────────────────────────────────
const ELECTION_YEAR = 2026;

// FL party codes → schema's D/R/I. Dem→D, Rep→R, all minor/NPA/IND/blank→I.
function mapParty(raw) {
  const p = String(raw ?? "").trim().toUpperCase();
  if (p === "DEM") return "D";
  if (p === "REP") return "R";
  return "I"; // NPA, IND, GRE, LPF, CPF, … and blanks
}

// FL numeric race codes → Feature-1 facet labels (match app/select/actions.ts).
// 5→White, 3→Black, 4→Hispanic/Latino, 2→Asian, 1/6/7→Other, 9/blank→null.
function mapRace(raw) {
  const c = raw == null || raw === "" ? null : Number(raw);
  switch (c) {
    case 5: return "White";
    case 3: return "Black";
    case 4: return "Hispanic/Latino";
    case 2: return "Asian";
    case 1:
    case 6:
    case 7: return "Other";
    default: return null; // 9 (unknown/multi) and blank
  }
}

// Sex M/F → M/F; anything else (incl. FL "U") → X.
function mapGender(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  return s === "M" ? "M" : s === "F" ? "F" : "X";
}

// Age from a birth date (year-only diff vs the election year), clamped 18–120.
function mapAge(birthISO) {
  if (!birthISO) return null;
  const y = Number(String(birthISO).slice(0, 4));
  if (!Number.isFinite(y) || y < 1900 || y > ELECTION_YEAR) return null;
  const age = ELECTION_YEAR - y;
  if (age < 18 || age > 120) return null;
  return age;
}

// Precinct normalize: strip a trailing ".0" (K003.0 → K003); keep real sub-
// precincts like K002.1. Empty → null.
function mapPrecinct(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.replace(/\.0$/, "");
}

// Compose a street address from parts when Residence_Address is blank.
function composeAddress(r) {
  const res = (r.Residence_Address ?? "").trim();
  let base = res;
  if (!base) {
    base = [r.Street_Number, r.Street_Dir, r.Street_Name, r.Street_Type]
      .map((x) => (x == null ? "" : String(x).trim()))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  const apt = (r.Apartment_Number ?? "").toString().trim();
  if (apt && !/\bapt\b/i.test(base)) base = `${base} Apt ${apt}`;
  return base || null;
}

// Strip ZIP+4 down to the 5-digit ZIP (for both storage-of-record + geocoding).
function zip5(raw) {
  const m = String(raw ?? "").match(/\d{5}/);
  return m ? m[0] : "";
}

const isoDate = (v) => (v ? String(v).slice(0, 10) : null);

// ── PII-safe console helpers ─────────────────────────────────────────────────
function maskName(first, last) {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const ini = (s) => (s ? s[0] + "***" : "—");
  return `${ini(f)} ${ini(l)}`;
}
function maskAddr(a) {
  if (!a) return "—";
  const s = String(a);
  return s.slice(0, 3) + "*".repeat(Math.max(0, s.length - 3));
}
function maskExternal(id) {
  const s = String(id ?? "");
  return s.length > 4 ? s.slice(0, 4) + "…" : s;
}

// ── python parser (openpyxl, read-only) → JSONL on disk ──────────────────────
// Emitted only into a tmp dir; deleted in finally{}. Keeps this script data-free.
const PY_PARSER = String.raw`
import sys, json, datetime
from openpyxl import load_workbook

xlsx_path = sys.argv[1]
out_path  = sys.argv[2]
limit     = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != "" else None

WANT = [
  "VoterID","Last_Name","First_Name","Residence_Address","Street_Number",
  "Street_Dir","Street_Name","Street_Type","Apartment_Number","Zip_Code",
  "City_Name","Race","Sex","Birth_Date","Registration_Date","Party",
  "Precinct","Telephone_Number","Voter_Status","Public_Email_Address",
]

def norm(v):
    if v is None: return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()
    return v

wb = load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb.active
rows = ws.iter_rows(values_only=True)
header = next(rows)
idx = {h: i for i, h in enumerate(header)}
missing = [w for w in WANT if w not in idx]
if missing:
    sys.stderr.write("MISSING_HEADERS:" + ",".join(missing) + "\n")
    sys.exit(2)

n = 0
with open(out_path, "w", encoding="utf-8") as f:
    for r in rows:
        # skip fully-empty trailing rows
        if r is None or all(c is None for c in r):
            continue
        rec = {w: norm(r[idx[w]]) for w in WANT}
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1
        if limit and n >= limit:
            break
wb.close()
sys.stderr.write("PARSED_ROWS:%d\n" % n)
`;

// ── Census batch geocoder ────────────────────────────────────────────────────
const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const CENSUS_BENCHMARK = "Public_AR_Current";
const CENSUS_BATCH_MAX = 10000;

// CSV-escape one field for the Census input file.
function csvField(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Parse one line of the Census output CSV (handles quoted fields w/ commas).
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// POST one batch CSV; returns Map<UniqueID, "SRID=4326;POINT(lon lat)">.
// Census output columns: UniqueID, input, matchIndicator, matchType,
// matchedAddress, "LON,LAT", tigerLineId, side.  Coords are LON,LAT order.
async function geocodeBatch(csvText, label) {
  const form = new FormData();
  form.append("benchmark", CENSUS_BENCHMARK);
  form.append(
    "addressFile",
    new Blob([csvText], { type: "text/csv" }),
    "batch.csv"
  );
  const res = await fetch(CENSUS_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Census HTTP ${res.status} (${label})`);
  const text = await res.text();
  const geoms = new Map();
  let matched = 0;
  let total = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    total++;
    const f = parseCsvLine(raw);
    const id = f[0];
    const status = f[2];
    if (status === "Match" && f[5]) {
      const [lon, lat] = f[5].split(",");
      const lonN = Number(lon);
      const latN = Number(lat);
      if (Number.isFinite(lonN) && Number.isFinite(latN)) {
        geoms.set(id, `SRID=4326;POINT(${lonN} ${latN})`);
        matched++;
      }
    }
  }
  return { geoms, matched, total };
}

// Smoke-test the API with one known address before committing to big batches.
async function geocodeSmokeTest() {
  const probe =
    'PROBE,"1600 Pennsylvania Ave NW",Washington,DC,20500\n';
  try {
    const { geoms } = await geocodeBatch(probe, "smoke");
    return geoms.size >= 0; // a 200 + parseable response is enough
  } catch (e) {
    console.log(`  ⚠ Census smoke-test failed: ${e.message}`);
    return false;
  }
}

// Geocode all rows, one Census file per ≤10k chunk, retrying a failed batch once.
async function geocodeAll(rows) {
  const geoms = new Map();
  let matched = 0;
  let attempted = 0;
  for (let start = 0; start < rows.length; start += CENSUS_BATCH_MAX) {
    const chunk = rows.slice(start, start + CENSUS_BATCH_MAX);
    const csv = chunk
      .map((r) =>
        [r.external_id, r._geoStreet, r._geoCity, r._geoState, r._geoZip]
          .map(csvField)
          .join(",")
      )
      .join("\n");
    const label = `batch ${start / CENSUS_BATCH_MAX + 1}/${Math.ceil(rows.length / CENSUS_BATCH_MAX)}`;
    attempted += chunk.length;
    let ok = false;
    for (let tries = 0; tries < 2 && !ok; tries++) {
      try {
        if (tries > 0) console.log(`  ↻ retrying ${label}…`);
        const { geoms: g, matched: m, total } = await geocodeBatch(csv, label);
        for (const [k, v] of g) geoms.set(k, v);
        matched += m;
        ok = true;
        console.log(`  ✓ ${label}: ${m.toLocaleString()}/${total.toLocaleString()} matched`);
      } catch (e) {
        console.log(`  ✗ ${label} attempt ${tries + 1}: ${e.message}`);
      }
    }
    if (!ok) console.log(`  ⚠ ${label} failed twice — those rows import with geom=null`);
  }
  return { geoms, matched, attempted };
}

// ── main ─────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "candi-voters-"));
const jsonlPath = join(tmp, "parsed.jsonl");
let exitCode = 0;

try {
  console.log("CANDI voter-file import");
  console.log(`  source     : ${XLSX_PATH.split("/").pop()}`);
  console.log(`  campaign   : ${CAMPAIGN.candidate} (${CAMPAIGN.id})`);
  console.log(`  org        : ${CAMPAIGN.org_id}`);
  console.log(`  geocode    : ${DO_GEOCODE ? "yes (US Census batch)" : "no"}`);
  console.log(`  tmp dir    : ${tmp}`);

  // 1) Upsert the campaign (idempotent on id).
  {
    const { error } = await supabase
      .from("campaigns")
      .upsert(CAMPAIGN, { onConflict: "id" });
    if (error) throw new Error(`campaign upsert: ${error.message}`);
    console.log(`\n✓ campaign upserted: ${CAMPAIGN.candidate}`);
  }

  // 2) Parse the xlsx via python/openpyxl → JSONL in tmp.
  console.log("\nparsing xlsx (openpyxl, read-only)…");
  {
    const py = spawnSync(
      "python3",
      ["-c", PY_PARSER, XLSX_PATH, jsonlPath, LIMIT == null ? "" : String(LIMIT)],
      { encoding: "utf-8", maxBuffer: 1024 * 1024 * 64 }
    );
    if (py.status !== 0) {
      throw new Error(`python parse failed (code ${py.status}): ${py.stderr?.trim()}`);
    }
    const m = (py.stderr || "").match(/PARSED_ROWS:(\d+)/);
    console.log(`  ✓ parsed ${m ? Number(m[1]).toLocaleString() : "?"} data rows`);
  }

  // 3) Map rows → voter records; drop non-active; build geocoder input fields.
  const lines = readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean);
  let skippedInactive = 0;
  let emailsSeen = 0;
  const seen = new Set(); // de-dupe within the file on external_id (idempotent key)
  const rows = [];
  for (const line of lines) {
    const r = JSON.parse(line);
    if (String(r.Voter_Status ?? "").trim().toUpperCase() !== "ACT") {
      skippedInactive++;
      continue;
    }
    const externalId = r.VoterID == null ? null : String(r.VoterID).trim();
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);

    if (r.Public_Email_Address && String(r.Public_Email_Address).trim()) emailsSeen++;

    const address = composeAddress(r);
    const city = (r.City_Name ?? "").toString().trim() || null;
    const z5 = zip5(r.Zip_Code);

    rows.push({
      // DB columns
      campaign_id: CAMPAIGN.id,
      external_id: externalId,
      first_name: (r.First_Name ?? "").toString().trim() || null,
      last_name: (r.Last_Name ?? "").toString().trim() || null,
      age: mapAge(r.Birth_Date),
      party: mapParty(r.Party),
      precinct: mapPrecinct(r.Precinct),
      address,
      city,
      state: "FL",
      zip: z5 || null,
      phone: (r.Telephone_Number ?? "").toString().trim() || null,
      email: (r.Public_Email_Address ?? "").toString().trim() || null,
      support: null, // real voters — never fabricate
      persuasion: null,
      vote_history: {}, // this export has NO per-election history
      flags: [],
      registration_date: isoDate(r.Registration_Date),
      race: mapRace(r.Race),
      gender: mapGender(r.Sex),
      geom: null, // filled after geocoding
      // geocoder-only (stripped before insert)
      _geoStreet: address ?? "",
      _geoCity: city ?? "",
      _geoState: "FL",
      _geoZip: z5,
    });
  }
  console.log(`  ✓ ${rows.length.toLocaleString()} active voters mapped`);
  console.log(`  • ${skippedInactive.toLocaleString()} inactive/non-ACT skipped`);
  console.log(`  • ${emailsSeen.toLocaleString()} rows carry a public email → voters.email`);

  // masked sample so we can eyeball the mapping without leaking PII
  console.log("\n  masked sample (mapped):");
  for (const v of rows.slice(0, 3)) {
    console.log(
      `   - ${maskExternal(v.external_id)} ${maskName(v.first_name, v.last_name)} | ` +
        `${maskAddr(v.address)} ${v.city ?? "—"} ${v.zip ?? "—"} | ` +
        `party=${v.party} race=${v.race ?? "null"} gender=${v.gender} age=${v.age ?? "null"} prec=${v.precinct ?? "null"}`
    );
  }

  // 4) Geocode (US Census batch). Smoke-test first; degrade gracefully.
  let geoms = new Map();
  let geoMatched = 0;
  let geoAttempted = 0;
  if (DO_GEOCODE) {
    console.log("\ngeocoding (US Census batch)…");
    const live = await geocodeSmokeTest();
    if (!live) {
      console.log("  ⚠ Census geocoder unavailable — importing with geom=null");
    } else {
      const geocodable = rows.filter((r) => r._geoStreet && r._geoZip);
      console.log(`  • ${geocodable.length.toLocaleString()} rows have street+zip to geocode`);
      const res = await geocodeAll(geocodable);
      geoms = res.geoms;
      geoMatched = res.matched;
      geoAttempted = res.attempted;
      for (const r of rows) {
        const g = geoms.get(r.external_id);
        if (g) r.geom = g;
      }
      const pct = geoAttempted ? ((geoMatched / geoAttempted) * 100).toFixed(1) : "0.0";
      console.log(`  ✓ geocode match rate: ${geoMatched.toLocaleString()}/${geoAttempted.toLocaleString()} (${pct}%)`);
    }
  }

  // 5) Upsert voters in chunks (idempotent on (campaign_id, external_id)).
  console.log("\nupserting voters…");
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map(({ _geoStreet, _geoCity, _geoState, _geoZip, ...rest }) => rest);
    const { error } = await supabase
      .from("voters")
      .upsert(chunk, { onConflict: "campaign_id,external_id", defaultToNull: true });
    if (error) throw new Error(`voter upsert @${i}: ${error.message}`);
    inserted += chunk.length;
    if (i % (CHUNK * 10) === 0 || inserted === rows.length) {
      process.stdout.write(`\r  ✓ ${inserted.toLocaleString()}/${rows.length.toLocaleString()} upserted`);
    }
  }
  process.stdout.write("\n");

  console.log("\n── summary ─────────────────────────────");
  console.log(`  imported (active)     : ${rows.length.toLocaleString()}`);
  console.log(`  inactive skipped      : ${skippedInactive.toLocaleString()}`);
  console.log(`  with geom (geocoded)  : ${[...rows].filter((r) => r.geom).length.toLocaleString()}`);
  console.log(`  campaign id           : ${CAMPAIGN.id}`);
  console.log("  (verify against the live DB separately)");
} catch (e) {
  console.error(`\n✗ import failed: ${e.message}`);
  exitCode = 1;
} finally {
  // PII hygiene: nuke the tmp dir (parsed JSONL + any geocode artifacts).
  try {
    rmSync(tmp, { recursive: true, force: true });
    console.log(`\n🧹 deleted tmp dir ${tmp}`);
  } catch (e) {
    console.error(`⚠ could not delete tmp dir ${tmp}: ${e.message}`);
  }
}

process.exit(exitCode);
