// Enrich (NOT replace) CANDI's real Easton Harrison voters (…030) with VAN data.
//
// Reusable + data-free: takes the VAN xlsx path and a campaign id as args.
// Contains NO embedded voter data. It:
//   1. parses the VAN export with python/openpyxl (read-only) → JSONL in tmp,
//   2. reads the campaign's existing voters from Supabase (service role) and
//      builds a normalized match key per voter,
//   3. matches each VAN row to one existing voter by
//        firstName + lastName + residence address + zip5  (normalized),
//   4. applies an efficient, CHUNKED, set-based UPDATE … FROM (VALUES …) keyed
//      on external_id over the DB connection (DATABASE_URL), setting:
//        • vanid           — always (for matched voters)
//        • mailing_address — always (composed mAddress, mCity, mState mZip5)
//        • phone           — ONLY where the existing phone is null/empty
//      Party / race / precinct / age / email / support / persuasion are NEVER
//      touched.
//
// The VAN export is NOT the universe — unmatched VAN rows are reported and
// skipped, and SoE-only voters keep all their existing data untouched.
//
// Usage:
//   node scripts/enrich-voter-van.mjs <path/to/Use This List.xlsx> [campaignId]
//
// Options (env or flags):
//   --campaign=<uuid>   target campaign id (default …030 Harrison)
//   --dry-run           compute + report match stats; apply NO updates
//   --apply             apply the set-based UPDATEs (default ON unless --dry-run)
//   --chunk=N           VALUES rows per UPDATE statement (default 1000)
//
// PII SAFETY: the source xlsx and the parsed JSONL are PII and live ONLY in
// os.tmpdir(), deleted in a finally{} block. Console output is masked (counts +
// masked samples only). Never commit any of these files.

import { readFileSync, rmSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
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
  console.error("Usage: node scripts/enrich-voter-van.mjs <Use This List.xlsx> [campaignId]");
  process.exit(1);
}
if (!existsSync(XLSX_PATH)) {
  console.error(`✗ file not found: ${XLSX_PATH}`);
  process.exit(1);
}

const CAMPAIGN_ID =
  positional[1] ?? flags.campaign ?? "00000000-0000-0000-0000-000000000030";
const DRY_RUN = !!flags["dry-run"];
const CHUNK = flags.chunk ? Math.max(1, Number(flags.chunk)) : 1000;

// ── env (read .env.local; do not print secrets) ──────────────────────────────
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
if (!env.DATABASE_URL) {
  console.error("✗ missing DATABASE_URL in .env.local (needed for the set-based UPDATE)");
  process.exit(1);
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── normalization (IDENTICAL for VAN + DB sides) ──────────────────────────────
// Directionals + street-type suffixes are standardized to a canonical short form
// so "3790 NW 24th Street" and "3790 Nw 24th St" collapse to the same key.
const DIRECTIONALS = new Map([
  ["NORTH", "N"], ["SOUTH", "S"], ["EAST", "E"], ["WEST", "W"],
  ["NORTHEAST", "NE"], ["NORTHWEST", "NW"], ["SOUTHEAST", "SE"], ["SOUTHWEST", "SW"],
  ["N", "N"], ["S", "S"], ["E", "E"], ["W", "W"],
  ["NE", "NE"], ["NW", "NW"], ["SE", "SE"], ["SW", "SW"],
]);
const SUFFIXES = new Map([
  ["STREET", "ST"], ["ST", "ST"],
  ["AVENUE", "AVE"], ["AVE", "AVE"], ["AV", "AVE"],
  ["BOULEVARD", "BLVD"], ["BLVD", "BLVD"],
  ["DRIVE", "DR"], ["DR", "DR"],
  ["ROAD", "RD"], ["RD", "RD"],
  ["LANE", "LN"], ["LN", "LN"],
  ["COURT", "CT"], ["CT", "CT"],
  ["PLACE", "PL"], ["PL", "PL"],
  ["TERRACE", "TER"], ["TERR", "TER"], ["TER", "TER"],
  ["CIRCLE", "CIR"], ["CIR", "CIR"],
  ["TRAIL", "TRL"], ["TRL", "TRL"],
  ["PARKWAY", "PKWY"], ["PKWY", "PKWY"],
  ["HIGHWAY", "HWY"], ["HWY", "HWY"],
  ["WAY", "WAY"],
  ["LOOP", "LOOP"],
  ["SQUARE", "SQ"], ["SQ", "SQ"],
  ["MANOR", "MNR"], ["MNR", "MNR"],
  ["PASS", "PASS"],
  ["PLAZA", "PLZ"], ["PLZ", "PLZ"],
  ["RUN", "RUN"],
  ["CRESCENT", "CRES"], ["CRES", "CRES"],
  ["GARDENS", "GDNS"], ["GARDEN", "GDN"],
  ["POINT", "PT"], ["PT", "PT"],
  ["CROSSING", "XING"], ["XING", "XING"],
]);
// Unit/secondary-address designators — dropped from the key so "123 Main St APT 4"
// and "123 Main St #4" don't fragment matches (residence-address granularity).
const UNIT_WORDS = new Set([
  "APT", "APARTMENT", "UNIT", "STE", "SUITE", "BLDG", "BUILDING", "FL", "FLOOR",
  "RM", "ROOM", "LOT", "TRLR", "SPACE", "SPC", "DEPT", "PH", "PENTHOUSE",
]);

function normName(s) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "") // strip all punctuation/space (handles "O'Connor", "Mc Bride")
    .trim();
}

function normZip5(s) {
  const m = String(s ?? "").match(/\d{5}/);
  return m ? m[0] : "";
}

// Normalize a street address into canonical tokens, dropping unit designators and
// any token that follows a unit designator (the unit value itself).
function addrTokens(s) {
  const cleaned = String(s ?? "")
    .toUpperCase()
    .replace(/[.,#]/g, " ") // punctuation that commonly glues onto tokens
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const toks = cleaned.split(" ");
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (UNIT_WORDS.has(t)) {
      // skip this designator AND the following unit value, if any
      if (i + 1 < toks.length) i++;
      continue;
    }
    const dir = DIRECTIONALS.get(t);
    const suf = SUFFIXES.get(t);
    out.push(dir ?? suf ?? t);
  }
  return out;
}
const normAddr = (s) => addrTokens(s).join(" ");

// The household-safe match key: first + last + residence street + zip5.
function matchKey(first, last, addr, zip) {
  return `${normName(first)}|${normName(last)}|${normAddr(addr)}|${normZip5(zip)}`;
}

// Looser household-safe bucket key for the prefix fallback: first + last + zip5
// (NO street). Two addresses in the same bucket are only joined when one's
// normalized token list is a prefix of the other's (see isTokenPrefix), and only
// when exactly one VAN candidate qualifies — so household members never collide.
function nameZipKey(first, last, zip) {
  return `${normName(first)}|${normName(last)}|${normZip5(zip)}`;
}
function isTokenPrefix(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return false; // empty address never prefix-matches
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Compose a one-line mailing address from VAN mailing parts.
function composeMailing(mAddr, mCity, mState, mZip5) {
  const street = String(mAddr ?? "").trim();
  const city = String(mCity ?? "").trim();
  const st = String(mState ?? "").trim();
  const z = normZip5(mZip5);
  if (!street) return null;
  const tail = [city, [st, z].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return tail ? `${street}, ${tail}` : street;
}

const cleanPhone = (s) => {
  const t = String(s ?? "").trim();
  return t || null;
};

// ── PII-safe console helpers ─────────────────────────────────────────────────
const maskName = (f, l) => {
  const ini = (s) => (s && String(s).trim() ? String(s).trim()[0] + "***" : "—");
  return `${ini(f)} ${ini(l)}`;
};
const maskAddr = (a) => (a ? String(a).slice(0, 3) + "*".repeat(Math.max(0, String(a).length - 3)) : "—");
const maskId = (id) => {
  const s = String(id ?? "");
  return s.length > 4 ? s.slice(0, 4) + "…" : s || "—";
};
const maskPhone = (p) => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d ? "***-***-" + d.slice(-4) : "—";
};

// ── SQL literal helper for the VALUES list ────────────────────────────────────
const sqlStr = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

// ── python parser (openpyxl, read-only) → JSONL in tmp ────────────────────────
// Row 1 is a junk title; the REAL header is row 2; data starts row 3.
const PY_PARSER = String.raw`
import sys, json
from openpyxl import load_workbook

xlsx_path = sys.argv[1]
out_path  = sys.argv[2]

# Column header → output key (header row is the SECOND row).
WANT = {
  "Voter File VANID": "vanid",
  "mAddress": "mAddr", "mCity": "mCity", "mState": "mState", "mZip5": "mZip5",
  "Address": "addr", "City": "city", "State": "state", "Zip5": "zip5",
  "LastName": "last", "FirstName": "first", "MiddleName": "middle", "Suffix": "suffix",
  "Pref Phone": "phone",
}

wb = load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb.active
rows = ws.iter_rows(values_only=True)
next(rows)                 # row 1: junk title
header = list(next(rows))  # row 2: real header
idx = {h: i for i, h in enumerate(header)}
missing = [h for h in WANT if h not in idx]
if missing:
    sys.stderr.write("MISSING_HEADERS:" + ",".join(missing) + "\n")
    sys.exit(2)

n = 0
with open(out_path, "w", encoding="utf-8") as f:
    for r in rows:                                   # row 3+: data
        if r is None or all(c is None for c in r):
            continue
        rec = {}
        for h, key in WANT.items():
            v = r[idx[h]]
            rec[key] = None if v is None else (v if isinstance(v, str) else str(v))
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1
wb.close()
sys.stderr.write("PARSED_ROWS:%d\n" % n)
`;

// ── main ─────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "candi-van-"));
const jsonlPath = join(tmp, "van.jsonl");
const sqlPath = join(tmp, "enrich.sql");
let exitCode = 0;

try {
  console.log("CANDI voter VAN enrichment");
  console.log(`  source     : ${XLSX_PATH.split("/").pop()}`);
  console.log(`  campaign   : ${CAMPAIGN_ID}`);
  console.log(`  mode       : ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log(`  tmp dir    : ${tmp}`);

  // 1) Parse the VAN xlsx → JSONL in tmp.
  console.log("\nparsing VAN xlsx (openpyxl, read-only)…");
  {
    const py = spawnSync("python3", ["-c", PY_PARSER, XLSX_PATH, jsonlPath], {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 128,
    });
    if (py.status !== 0) {
      throw new Error(`python parse failed (code ${py.status}): ${py.stderr?.trim()}`);
    }
    const m = (py.stderr || "").match(/PARSED_ROWS:(\d+)/);
    console.log(`  ✓ parsed ${m ? Number(m[1]).toLocaleString() : "?"} VAN rows`);
  }

  // 2) Build the VAN match indexes:
  //    • vanByKey   — exact key (first+last+addr+zip5) → payload  [pass 1]
  //    • vanByNZ    — name+zip5 bucket → [{ tokens, payload }]    [pass 2, prefix]
  //    On duplicate EXACT keys (rare household collisions), keep the FIRST.
  const vanLines = readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean);
  const vanByKey = new Map();
  const vanByNZ = new Map();
  let vanDupKeys = 0;
  let vanRows = 0;
  for (const line of vanLines) {
    const r = JSON.parse(line);
    vanRows++;
    const payload = {
      vanid: r.vanid != null && String(r.vanid).trim() ? String(r.vanid).trim() : null,
      phone: cleanPhone(r.phone),
      mailing: composeMailing(r.mAddr, r.mCity, r.mState, r.mZip5),
    };
    const key = matchKey(r.first, r.last, r.addr, r.zip5);
    if (vanByKey.has(key)) vanDupKeys++;
    else vanByKey.set(key, payload);
    // fallback bucket
    const nz = nameZipKey(r.first, r.last, r.zip5);
    const bucket = vanByNZ.get(nz) ?? [];
    bucket.push({ tokens: addrTokens(r.addr), payload });
    vanByNZ.set(nz, bucket);
  }
  console.log(`  • ${vanByKey.size.toLocaleString()} unique match keys (${vanDupKeys.toLocaleString()} dup keys skipped)`);

  // 3) Read existing campaign voters (paged; service role bypasses RLS) and match.
  console.log("\nreading existing voters from Supabase…");
  const updates = []; // { external_id, vanid, mailing, phone|null }
  let dbTotal = 0;
  let matched = 0;
  let matchedExact = 0;
  let matchedPrefix = 0;
  let ambiguousSkipped = 0;
  let phoneGapFilled = 0;
  let mailingSet = 0;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("voters")
      .select("external_id, first_name, last_name, address, zip, phone")
      .eq("campaign_id", CAMPAIGN_ID)
      .order("external_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`voter read @${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const v of data) {
      dbTotal++;
      if (!v.external_id) continue;

      // Pass 1 — exact normalized key (first+last+addr+zip5).
      let hit = vanByKey.get(matchKey(v.first_name, v.last_name, v.address, v.zip));

      // Pass 2 — prefix fallback within the first+last+zip5 bucket. Accept ONLY a
      // single qualifying VAN candidate (one token list is a prefix of the other)
      // so household members / ambiguous stacks are never mis-joined.
      if (!hit) {
        const bucket = vanByNZ.get(nameZipKey(v.first_name, v.last_name, v.zip));
        if (bucket && bucket.length) {
          const dbtk = addrTokens(v.address);
          const qual = bucket.filter(
            (c) => isTokenPrefix(c.tokens, dbtk) || isTokenPrefix(dbtk, c.tokens)
          );
          if (qual.length === 1) {
            hit = qual[0].payload;
            matchedPrefix++;
          } else if (qual.length > 1) {
            ambiguousSkipped++;
          }
        }
      } else {
        matchedExact++;
      }

      if (!hit) continue;
      matched++;
      const hasPhone = v.phone != null && String(v.phone).trim() !== "";
      const fillPhone = !hasPhone && hit.phone ? hit.phone : null;
      if (fillPhone) phoneGapFilled++;
      if (hit.mailing) mailingSet++;
      updates.push({
        external_id: v.external_id,
        vanid: hit.vanid,
        mailing: hit.mailing,
        phone: fillPhone, // null ⇒ COALESCE keeps the existing phone
      });
    }
    if (data.length < PAGE) break;
  }

  const pct = dbTotal ? ((matched / dbTotal) * 100).toFixed(1) : "0.0";
  console.log(`  • ${dbTotal.toLocaleString()} existing voters scanned`);
  console.log(`  ✓ matched ${matched.toLocaleString()} (${pct}%) to a VAN row`);
  console.log(`    – exact key           : ${matchedExact.toLocaleString()}`);
  console.log(`    – prefix fallback     : ${matchedPrefix.toLocaleString()} (${ambiguousSkipped.toLocaleString()} ambiguous skipped)`);
  console.log(`  • vanid to set        : ${updates.filter((u) => u.vanid).length.toLocaleString()}`);
  console.log(`  • mailing_address set : ${mailingSet.toLocaleString()}`);
  console.log(`  • phone-gap to fill   : ${phoneGapFilled.toLocaleString()}`);
  console.log(`  • SoE-only (unmatched): ${(dbTotal - matched).toLocaleString()}`);
  console.log(`  • VAN-only (no SoE)   : ${(vanByKey.size - matched).toLocaleString()} (of ${vanByKey.size.toLocaleString()} unique VAN keys)`);

  // masked sample of a few enriched rows
  console.log("\n  masked sample (to be enriched):");
  for (const u of updates.slice(0, 3)) {
    console.log(
      `   - extId=${maskId(u.external_id)} vanid=${maskId(u.vanid)} ` +
        `mailing=${maskAddr(u.mailing)} phoneFill=${maskPhone(u.phone)}`
    );
  }

  if (matched === 0) {
    console.log("\n⚠ no matches — nothing to update. Re-check the campaign id / source.");
  } else if (DRY_RUN) {
    console.log("\n(dry run) — no updates applied.");
  } else {
    // 4) Build ONE set-based UPDATE … FROM (VALUES …) and apply it in chunked,
    //    single-statement transactions via the Supabase CLI.
    //    Keyed on external_id within the campaign. vanid + mailing_address are
    //    always written; phone is COALESCE(existing, new) so we NEVER clobber an
    //    existing SoE phone — only fill a gap (new is null unless we chose to fill).
    //
    //    Each chunk is a SINGLE statement (one UPDATE … FROM (VALUES …)): a single
    //    statement is itself atomic, and `supabase db query -f` runs the file as
    //    one prepared statement (it rejects multi-command "begin; …; commit;"
    //    scripts), so we must NOT wrap multiple commands together.
    console.log("\nbuilding + applying set-based UPDATEs…");
    const buildStmt = (chunk) => {
      const values = chunk
        .map(
          (u) =>
            `(${sqlStr(u.external_id)}, ${sqlStr(u.vanid)}, ${sqlStr(u.mailing)}, ${sqlStr(u.phone)})`
        )
        .join(",\n  ");
      return (
        `update public.voters v set\n` +
        `  vanid = d.vanid,\n` +
        `  mailing_address = d.mailing_address,\n` +
        `  phone = coalesce(v.phone, d.phone),\n` +
        `  updated_at = now()\n` +
        `from (values\n  ${values}\n) as d(external_id, vanid, mailing_address, phone)\n` +
        `where v.campaign_id = ${sqlStr(CAMPAIGN_ID)} and v.external_id = d.external_id;`
      );
    };

    const nChunks = Math.ceil(updates.length / CHUNK);
    console.log(`  • ${nChunks} single-statement UPDATE(s) over ${updates.length.toLocaleString()} rows (chunk=${CHUNK})`);
    let applied = 0;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      writeFileSync(sqlPath, buildStmt(chunk), "utf-8");
      const res = spawnSync(
        "pnpm",
        ["exec", "supabase", "db", "query", "--db-url", env.DATABASE_URL, "-f", sqlPath],
        { encoding: "utf-8", maxBuffer: 1024 * 1024 * 64 }
      );
      if (res.status !== 0) {
        throw new Error(
          `apply failed @${i} (code ${res.status}): ${(res.stderr || res.stdout || "").trim().slice(0, 600)}`
        );
      }
      applied += chunk.length;
      process.stdout.write(`\r  ✓ ${applied.toLocaleString()}/${updates.length.toLocaleString()} rows updated`);
    }
    process.stdout.write("\n");
  }

  console.log("\n── summary ─────────────────────────────");
  console.log(`  campaign            : ${CAMPAIGN_ID}`);
  console.log(`  matched / scanned   : ${matched.toLocaleString()} / ${dbTotal.toLocaleString()} (${pct}%)`);
  console.log(`  vanid set           : ${updates.filter((u) => u.vanid).length.toLocaleString()}`);
  console.log(`  phone-gap filled    : ${phoneGapFilled.toLocaleString()}`);
  console.log(`  mailing_address set : ${mailingSet.toLocaleString()}`);
  console.log("  (verify against the live DB separately)");
} catch (e) {
  console.error(`\n✗ enrichment failed: ${e.message}`);
  exitCode = 1;
} finally {
  // PII hygiene: nuke tmp (parsed JSONL + generated SQL, both PII-bearing).
  try {
    rmSync(tmp, { recursive: true, force: true });
    console.log(`\n🧹 deleted tmp dir ${tmp}`);
  } catch (e) {
    console.error(`⚠ could not delete tmp dir ${tmp}: ${e.message}`);
  }
}

process.exit(exitCode);
