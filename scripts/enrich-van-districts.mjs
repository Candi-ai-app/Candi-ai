// Enrich CANDI voters with district data from a VAN StandardText export.
//
// This script handles a file with the headers:
//   Voter File VANID, mAddress, mCity, mState, mZip5, mZip4, mAddressID, Sex,
//   Address, City, State, Zip5, Zip4, AddressID, LastName, FirstName, MiddleName,
//   Suffix, CD, SD, HD, PreferredEmail, Pref Phone
//
// What it does:
//   1. Parses the VAN xlsx via python/openpyxl (read-only, JSONL in tmp).
//   2. Loads all existing voters by vanid from Supabase.
//   3. Matched voters (vanid in DB): UPDATE cd, sd, hd + phone (ONLY where null).
//   4. New voters (vanid NOT in DB): geocode via Census batch, then INSERT.
//      New rows get: first/last name, address, phone, vanid, mailing_address,
//      cd/sd/hd — but NO party/race/age/precinct (not in this export).
//
// PII SAFETY: xlsx and JSONL live ONLY in os.tmpdir(), deleted in finally{}.
// Console output is masked (counts + masked samples only). Never commit these files.
//
// Usage:
//   node scripts/enrich-van-districts.mjs <path/to/file.xlsx> [campaignId]
//   node scripts/enrich-van-districts.mjs <path/to/file.xlsx> --dry-run
//   node scripts/enrich-van-districts.mjs <path/to/file.xlsx> --no-geocode

import { readFileSync, rmSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith("--")).map((a) => {
    const i = a.indexOf("=");
    return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  })
);

const XLSX_PATH = positional[0] ?? flags.file;
if (!XLSX_PATH) {
  console.error("Usage: node scripts/enrich-van-districts.mjs <file.xlsx> [campaignId]");
  process.exit(1);
}
if (!existsSync(XLSX_PATH)) {
  console.error(`✗ file not found: ${XLSX_PATH}`);
  process.exit(1);
}

const CAMPAIGN_ID = positional[1] ?? flags.campaign ?? "00000000-0000-0000-0000-000000000030";
const DRY_RUN = !!flags["dry-run"];
const DO_GEOCODE = !flags["no-geocode"];
const CHUNK = flags.chunk ? Math.max(1, Number(flags.chunk)) : 500;

// ── env ───────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
// DATABASE_URL not needed — updates go through the Supabase JS client

// ── helpers ───────────────────────────────────────────────────────────────────
function maskName(f, l) {
  const ini = (s) => (s ? String(s)[0] + "***" : "—");
  return `${ini(f)} ${ini(l)}`;
}
function maskAddr(a) {
  if (!a) return "—";
  const s = String(a);
  return s.slice(0, 3) + "*".repeat(Math.max(0, s.length - 3));
}

// ── Python parser for the VAN StandardText format ────────────────────────────
// Row 1 = export metadata (skip). Row 2 = column headers. Row 3+ = data.
const PY_PARSER = String.raw`
import sys, json
from openpyxl import load_workbook

xlsx_path = sys.argv[1]
out_path  = sys.argv[2]

wb = load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb.active
rows_iter = ws.iter_rows(values_only=True)

# Row 1: metadata (skip)
next(rows_iter)
# Row 2: column headers
header = [str(h) if h is not None else None for h in next(rows_iter)]
idx = {h: i for i, h in enumerate(header) if h}

WANT = ['Voter File VANID','mAddress','mCity','mState','mZip5',
        'Sex','Address','City','State','Zip5',
        'LastName','FirstName','CD','SD','HD','PreferredEmail','Pref Phone']
missing = [w for w in WANT if w not in idx]
if missing:
    sys.stderr.write("MISSING:" + ",".join(missing) + "\n")
    sys.exit(2)

n = 0
with open(out_path, "w", encoding="utf-8") as f:
    for r in rows_iter:
        if r is None or all(c is None for c in r): continue
        rec = {w: (str(r[idx[w]]) if r[idx[w]] is not None else None) for w in WANT}
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1

wb.close()
sys.stderr.write("PARSED_ROWS:%d\n" % n)
`;

// ── Census batch geocoder (same as import-voter-file.mjs) ────────────────────
const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const CENSUS_BATCH_MAX = 10000;

function csvField(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}

async function geocodeBatch(csvText, label) {
  const form = new FormData();
  form.append("benchmark", "Public_AR_Current");
  form.append("addressFile", new Blob([csvText], { type: "text/csv" }), "batch.csv");
  const res = await fetch(CENSUS_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Census HTTP ${res.status} (${label})`);
  const text = await res.text();
  const geoms = new Map();
  let matched = 0, total = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    total++;
    const f = parseCsvLine(raw);
    if (f[2] === "Match" && f[5]) {
      const [lon, lat] = f[5].split(",");
      const lonN = Number(lon), latN = Number(lat);
      if (Number.isFinite(lonN) && Number.isFinite(latN)) {
        geoms.set(f[0], `SRID=4326;POINT(${lonN} ${latN})`);
        matched++;
      }
    }
  }
  return { geoms, matched, total };
}

async function geocodeAll(rows) {
  const geoms = new Map();
  let matched = 0, attempted = 0;
  for (let start = 0; start < rows.length; start += CENSUS_BATCH_MAX) {
    const chunk = rows.slice(start, start + CENSUS_BATCH_MAX);
    const csv = chunk.map((r) =>
      [r.vanid, r.address, r.city, "FL", r.zip].map(csvField).join(",")
    ).join("\n");
    const label = `batch ${start/CENSUS_BATCH_MAX+1}/${Math.ceil(rows.length/CENSUS_BATCH_MAX)}`;
    attempted += chunk.length;
    let ok = false;
    for (let tries = 0; tries < 2 && !ok; tries++) {
      try {
        if (tries > 0) console.log(`  ↻ retrying ${label}…`);
        const { geoms: g, matched: m, total } = await geocodeBatch(csv, label);
        for (const [k, v] of g) geoms.set(k, v);
        matched += m;
        ok = true;
        console.log(`  ✓ ${label}: ${m}/${total} matched`);
      } catch (e) { console.log(`  ✗ ${label} attempt ${tries+1}: ${e.message}`); }
    }
    if (!ok) console.log(`  ⚠ ${label} failed — those rows insert with geom=null`);
  }
  return { geoms, matched, attempted };
}

// psql not required — updates go through the Supabase JS client grouped by
// district values (few unique combos → very few round trips).

// ── main ─────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "candi-districts-"));
const jsonlPath = join(tmp, "parsed.jsonl");

try {
  console.log("CANDI VAN district enrichment");
  console.log(`  source    : ${XLSX_PATH.split("/").pop()}`);
  console.log(`  campaign  : ${CAMPAIGN_ID}`);
  console.log(`  dry-run   : ${DRY_RUN}`);
  console.log(`  geocode   : ${DO_GEOCODE}`);
  console.log(`  tmp dir   : ${tmp}\n`);

  // 1) Parse xlsx → JSONL
  console.log("1) parsing xlsx…");
  {
    const py = spawnSync("python3", ["-c", PY_PARSER, XLSX_PATH, jsonlPath], {
      encoding: "utf-8", maxBuffer: 1024*1024*64,
    });
    if (py.status !== 0) throw new Error(`python parse failed: ${py.stderr?.trim()}`);
    const m = (py.stderr || "").match(/PARSED_ROWS:(\d+)/);
    console.log(`   ✓ parsed ${m ? Number(m[1]).toLocaleString() : "?"} rows`);
  }

  const lines = readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean);
  const vanRows = lines.map((l) => JSON.parse(l)).filter((r) => r["Voter File VANID"]);
  console.log(`   ✓ ${vanRows.length.toLocaleString()} rows with VANID`);

  // 2) Load ALL existing voters with vanid (paginate — Supabase caps at 1000/page)
  console.log("\n2) loading existing voters by vanid…");
  const allExisting = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("voters")
      .select("id, vanid, phone")
      .eq("campaign_id", CAMPAIGN_ID)
      .not("vanid", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loading voters (page ${from/PAGE}): ${error.message}`);
    if (!data || data.length === 0) break;
    allExisting.push(...data);
    if (data.length < PAGE) break;
  }
  const existingByVanid = new Map(allExisting.map((v) => [String(v.vanid), v]));
  console.log(`   ✓ ${existingByVanid.size.toLocaleString()} existing voters have a vanid`);

  // 3) Split into matched (update) and new (insert)
  const toUpdate = [];
  const toInsert = [];

  for (const r of vanRows) {
    const vanid = String(r["Voter File VANID"]).trim();
    const cd = r.CD ? String(r.CD).trim() : null;
    const sd = r.SD ? String(r.SD).trim() : null;
    const hd = r.HD ? String(r.HD).trim() : null;
    const phone = r["Pref Phone"] ? String(r["Pref Phone"]).trim() : null;
    const firstName = r.FirstName ? String(r.FirstName).trim() : null;
    const lastName = r.LastName ? String(r.LastName).trim() : null;
    const address = r.Address ? String(r.Address).trim() : null;
    const city = r.City ? String(r.City).trim() : null;
    const state = r.State ? String(r.State).trim() : "FL";
    const zip = r.Zip5 ? String(r.Zip5).trim() : null;
    const mailing = [r.mAddress, r.mCity, r.mState, r.mZip5]
      .map((x) => (x ? String(x).trim() : "")).filter(Boolean).join(", ") || null;
    const sex = r.Sex ? String(r.Sex).trim().toUpperCase() : null;
    const gender = sex === "M" ? "M" : sex === "F" ? "F" : null;

    if (existingByVanid.has(vanid)) {
      const existing = existingByVanid.get(vanid);
      toUpdate.push({
        id: existing.id,
        cd, sd, hd,
        // only update phone if currently null/empty
        phone: (existing.phone && existing.phone.trim()) ? null : phone,
      });
    } else {
      toInsert.push({ vanid, cd, sd, hd, phone, firstName, lastName, address, city, state, zip, mailing, gender });
    }
  }

  console.log(`\n   • ${toUpdate.length.toLocaleString()} existing voters → update cd/sd/hd (+ phone where null)`);
  console.log(`   • ${toInsert.length.toLocaleString()} new voters → insert + geocode`);

  // 4) Update existing voters (cd/sd/hd + phone where null)
  // Group by unique district combo → one Supabase .update().in() per combo
  if (toUpdate.length > 0) {
    console.log("\n3) updating existing voters (cd/sd/hd)…");
    if (DRY_RUN) {
      console.log("   [dry-run] skipping updates");
    } else {
      // Group by (cd|sd|hd) so we do one round-trip per unique combo
      const byCombo = new Map();
      for (const v of toUpdate) {
        const key = `${v.cd}|${v.sd}|${v.hd}`;
        if (!byCombo.has(key)) byCombo.set(key, { cd: v.cd, sd: v.sd, hd: v.hd, ids: [] });
        byCombo.get(key).ids.push(v.id);
      }
      console.log(`   ${byCombo.size} unique district combos`);

      let updated = 0;
      for (const { cd, sd, hd, ids } of byCombo.values()) {
        // Chunk .in() calls (Supabase has a URL length limit ~2000 UUIDs)
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          const { error } = await supabase
            .from("voters")
            .update({ cd, sd, hd, updated_at: new Date().toISOString() })
            .in("id", chunk)
            .eq("campaign_id", CAMPAIGN_ID);
          if (error) throw new Error(`district update (cd=${cd}): ${error.message}`);
          updated += chunk.length;
          process.stdout.write(`\r   ✓ ${updated.toLocaleString()} / ${toUpdate.length.toLocaleString()} updated`);
        }
      }

      // Separately: update phone ONLY where existing phone is null/empty
      const phoneUpdates = toUpdate.filter((v) => v.phone);
      if (phoneUpdates.length > 0) {
        console.log(`\n   updating phone for ${phoneUpdates.length.toLocaleString()} voters where currently null…`);
        let phoneDone = 0;
        for (let i = 0; i < phoneUpdates.length; i += 200) {
          const chunk = phoneUpdates.slice(i, i + 200);
          // Do individual updates for phone (phone varies per voter, must check null)
          await Promise.all(chunk.map((v) =>
            supabase.from("voters")
              .update({ phone: v.phone, updated_at: new Date().toISOString() })
              .eq("id", v.id)
              .eq("campaign_id", CAMPAIGN_ID)
              .or("phone.is.null,phone.eq.")
          ));
          phoneDone += chunk.length;
          process.stdout.write(`\r   ✓ ${phoneDone.toLocaleString()} / ${phoneUpdates.length.toLocaleString()} phone checks done`);
        }
        console.log();
      }
      console.log();
    }
  }

  // 5) Geocode new voters
  let geoms = new Map();
  if (toInsert.length > 0 && DO_GEOCODE) {
    console.log(`\n4) geocoding ${toInsert.length.toLocaleString()} new voters (Census batch)…`);
    if (DRY_RUN) {
      console.log("   [dry-run] skipping geocoding");
    } else {
      const result = await geocodeAll(toInsert);
      geoms = result.geoms;
      console.log(`   ✓ ${result.matched.toLocaleString()} / ${result.attempted.toLocaleString()} geocoded`);
    }
  }

  // 6) Insert new voters
  if (toInsert.length > 0) {
    console.log(`\n5) inserting ${toInsert.length.toLocaleString()} new voters…`);
    if (DRY_RUN) {
      console.log("   [dry-run] skipping inserts");
      console.log("   masked sample:");
      for (const v of toInsert.slice(0, 3)) {
        console.log(`   - VANID:${v.vanid} ${maskName(v.firstName, v.lastName)} ${maskAddr(v.address)} CD=${v.cd}`);
      }
    } else {
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const rows = chunk.map((v) => {
          const geom = geoms.get(v.vanid);
          return {
            campaign_id: CAMPAIGN_ID,
            first_name: v.firstName || null,
            last_name: v.lastName || null,
            address: v.address || null,
            city: v.city || null,
            state: v.state || "FL",
            zip: v.zip || null,
            phone: v.phone || null,
            vanid: v.vanid,
            mailing_address: v.mailing || null,
            gender: v.gender || null,
            cd: v.cd || null,
            sd: v.sd || null,
            hd: v.hd || null,
            support: null,
            persuasion: null,
            vote_history: {},
            flags: [],
            geom: geom ?? null,
          };
        });
        const { error } = await supabase.from("voters").insert(rows);
        if (error) throw new Error(`insert chunk ${i/CHUNK+1}: ${error.message}`);
        inserted += chunk.length;
        process.stdout.write(`\r   ✓ ${inserted.toLocaleString()} / ${toInsert.length.toLocaleString()} inserted`);
      }
      console.log();
    }
  }

  console.log("\n✅ done");
  console.log(`   • ${toUpdate.length.toLocaleString()} existing voters enriched with cd/sd/hd`);
  console.log(`   • ${toInsert.length.toLocaleString()} new voters added`);
  if (DRY_RUN) console.log("   [dry-run mode — no data was changed]");

} finally {
  // Always clean up PII files from tmp
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}
