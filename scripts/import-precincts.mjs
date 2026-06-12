// CANDI — import Broward County precinct boundaries into public.precincts.
//
// Source: public/geo/broward-precincts-2026.json — the lean copy of Broward
// County GIS's official VoterPrecincts2026 layer (346 precincts, ~0.5 MB,
// properties stripped to PRECINCT, geometry generalized to ~0.5 m).
//
// supabase-js can't run raw SQL, and the geometry column needs PostGIS
// functions, so this script generates batched UPSERT statements of the form
//
//   insert into public.precincts (county, code, geom)
//   values ('Broward', $code,
//           ST_Multi(ST_CollectionExtract(ST_MakeValid(
//             ST_SetSRID(ST_GeomFromGeoJSON($geojson), 4326)), 3)))
//   on conflict (county, code) do update set geom = excluded.geom
//
// (ST_Multi coerces the mixed Polygon/MultiPolygon source to the table's
// MultiPolygon type; ST_MakeValid + ST_CollectionExtract(…, 3) repair any
// self-intersections introduced by simplification.)
//
// Run:  node scripts/import-precincts.mjs
// Idempotent — upserts on (county, code), safe to re-run.
//
// Execution paths, in order of preference:
//   1. Direct: if the "pg" driver is importable (it is NOT a repo dependency —
//      point PG_MODULE at any pg install, e.g.
//      PG_MODULE=/tmp/candi-pg/node_modules/pg/lib/index.js), the script
//      connects with DATABASE_URL from .env.local and runs every batch itself.
//      Note: Supabase's direct host (db.<ref>.supabase.co) is IPv6-only, and
//      the .env.local DATABASE_URL wraps the password in literal [brackets]
//      (template leftovers) which this script strips.
//   2. Generator: with no driver available it writes the batches to
//      supabase/.precinct-import/batch-*.sql for execution over any SQL path
//      (Supabase MCP execute_sql, the dashboard SQL editor, or psql).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const GEOJSON_PATH = "public/geo/broward-precincts-2026.json";
const COUNTY = "Broward";
const BATCH_SIZE = 25;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const gj = JSON.parse(readFileSync(GEOJSON_PATH, "utf8"));
const features = gj.features ?? [];
if (features.length === 0) {
  console.error(`No features in ${GEOJSON_PATH}`); process.exit(1);
}
console.log(`${features.length} precincts in ${GEOJSON_PATH}`);

const GEOM_EXPR = (geojsonSqlLiteral) =>
  `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonSqlLiteral}), 4326)), 3))`;

const sqlQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

function batchSql(batch) {
  const rows = batch.map((f) =>
    `  (${sqlQuote(COUNTY)}, ${sqlQuote(f.properties.PRECINCT)}, ${GEOM_EXPR(sqlQuote(JSON.stringify(f.geometry)))})`
  );
  return (
    `insert into public.precincts (county, code, geom)\nvalues\n${rows.join(",\n")}\n` +
    `on conflict (county, code) do update set geom = excluded.geom;`
  );
}

const batches = [];
for (let i = 0; i < features.length; i += BATCH_SIZE) {
  batches.push(batchSql(features.slice(i, i + BATCH_SIZE)));
}

// ── Path 1: execute directly when a pg driver is reachable ────────────────────
async function loadPg() {
  try {
    const mod = await import(process.env.PG_MODULE || "pg");
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

const pg = await loadPg();
if (pg && env.DATABASE_URL) {
  const m = env.DATABASE_URL.match(/^postgresql:\/\/([^:]+):(.+)@([^@]+):(\d+)\/(.+)$/);
  if (!m) { console.error("Unparseable DATABASE_URL in .env.local"); process.exit(1); }
  const client = new pg.Client({
    host: m[3], port: Number(m[4]), user: m[1], database: m[5],
    password: m[2].replace(/^\[|\]$/g, ""), // strip [template] brackets
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (let i = 0; i < batches.length; i++) {
      await client.query(batches[i]);
      process.stdout.write(`\r  upserted batch ${i + 1}/${batches.length}`);
    }
    process.stdout.write("\n");
    const { rows } = await client.query(
      "select count(*)::int as n, sum(ST_NPoints(geom))::int as pts from public.precincts where county = $1",
      [COUNTY]
    );
    console.log(`public.precincts now holds ${rows[0].n} ${COUNTY} precincts (${rows[0].pts} vertices).`);
  } finally {
    await client.end();
  }
} else {
  // ── Path 2: emit batch files for any other SQL route ────────────────────────
  const dir = "supabase/.precinct-import";
  mkdirSync(dir, { recursive: true });
  batches.forEach((sql, i) => {
    writeFileSync(`${dir}/batch-${String(i + 1).padStart(2, "0")}.sql`, sql + "\n");
  });
  console.log(
    `pg driver not available — wrote ${batches.length} batch files to ${dir}/.\n` +
    `Run each against the project DB (Supabase MCP execute_sql, SQL editor, or psql),\n` +
    `then verify with:  select count(*) from public.precincts;`
  );
}
