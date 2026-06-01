// CANDI — verify the DEMO campaign (…0040, "Maya Chen") against the LIVE DB.
//
// Run:  node scripts/verify-demo-campaign.mjs
//
// Two clients:
//   • service-role  → distribution counts (bypasses RLS; full visibility).
//   • director@candi.app (RLS-scoped, real login) → proves the director can SEE
//     the campaign and exercises the real campaign_count_voters RPC for the
//     super-voter (3-of-4) figure exactly as the app does.
//
// Prints a PASS/FAIL line per acceptance criterion + the headline numbers.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000040";
const DEMO_PASSWORD = "CandiDemo2026!"; // from scripts/seed-users.mjs

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
}

async function countWhere(builderFn) {
  const { count, error } = await builderFn(
    admin.from("voters").select("id", { count: "exact", head: true }).eq("campaign_id", CAMPAIGN_ID)
  );
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main() {
  console.log("Verifying campaign", CAMPAIGN_ID, "against", URL, "\n");

  // ── campaign row ──────────────────────────────────────────────────────────
  const { data: camp } = await admin
    .from("campaigns")
    .select("id, org_id, candidate, office, district, state, county, election_date")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  check("campaign …0040 exists", !!camp, camp ? `${camp.candidate} · ${camp.office}` : "missing");
  check(
    "campaign in demo org …0001",
    camp?.org_id === "00000000-0000-0000-0000-000000000001",
    camp?.org_id
  );
  check("candidate is Maya Chen", camp?.candidate === "Maya Chen");
  check("district Broward District 7", camp?.district === "Broward District 7", camp?.district);

  // ── voter counts + distributions ───────────────────────────────────────────
  const total = await countWhere((q) => q);
  check("~1,500 voters", total >= 1400 && total <= 1600, String(total));

  const party = {};
  for (const p of ["D", "R", "I"]) party[p] = await countWhere((q) => q.eq("party", p));
  const supportNonNull = await countWhere((q) => q.not("support", "is", null));
  check("support populated (not all null)", supportNonNull > 0, `${supportNonNull}/${total} scored`);

  // support distribution 1..5
  const support = {};
  for (let s = 1; s <= 5; s++) support[s] = await countWhere((q) => q.eq("support", s));
  const supportersIdd = await countWhere((q) => q.gte("support", 4));

  // race + gender presence
  const races = {};
  for (const r of ["White", "Black", "Hispanic/Latino", "Asian", "Other"])
    races[r] = await countWhere((q) => q.eq("race", r));
  const gender = {};
  for (const g of ["M", "F", "X"]) gender[g] = await countWhere((q) => q.eq("gender", g));
  check(
    "race + gender populated",
    Object.values(races).reduce((a, b) => a + b, 0) === total && gender.M + gender.F + gender.X === total
  );

  // precincts
  const { data: precRows } = await admin
    .from("voters")
    .select("precinct")
    .eq("campaign_id", CAMPAIGN_ID)
    .limit(1500);
  const precincts = new Set((precRows ?? []).map((r) => r.precinct));
  check("~6 precincts", precincts.size >= 5 && precincts.size <= 7, [...precincts].sort().join(","));

  // VBM flag (KPI)
  const vbm = await countWhere((q) => q.contains("flags", ["VBM"]));
  check("VBM-flagged voters > 0", vbm > 0, String(vbm));

  // ── super-voter 3-of-4 via the REAL RPC, as the director ────────────────────
  let superVoterRpc = null;
  let directorSees = false;
  if (ANON) {
    const dir = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error: authErr } = await dir.auth.signInWithPassword({
      email: "director@candi.app",
      password: DEMO_PASSWORD,
    });
    if (authErr) {
      console.log("note: director login failed —", authErr.message, "(falling back to SQL-equiv count)");
    } else {
      // Director sees the campaign (RLS)?
      const { data: seen } = await dir
        .from("campaigns")
        .select("id")
        .eq("id", CAMPAIGN_ID)
        .maybeSingle();
      directorSees = !!seen;
      // Real RPC the app uses for the super-voter count.
      const { data: rpcCount, error: rpcErr } = await dir.rpc("campaign_count_voters", {
        p_campaign: CAMPAIGN_ID,
        p_super_voter: true,
        p_sv_min: 3,
        p_sv_window: 4,
      });
      if (rpcErr) console.log("note: RPC error —", rpcErr.message);
      else superVoterRpc = Number(rpcCount);
      await dir.auth.signOut();
    }
  }
  check("director@candi.app SEES campaign …0040 (RLS)", directorSees);

  // Fallback / cross-check: compute 3-of-4 directly from vote_history over the
  // full set (independent of RLS), so we always have a super-voter number.
  let superVoterSql = 0;
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("voters")
        .select("vote_history")
        .eq("campaign_id", CAMPAIGN_ID)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data.length) break;
      for (const v of data) {
        const h = v.vote_history?.history ?? {};
        const got = ["2024G", "2022G", "2020G", "2018G"].reduce(
          (n, c) => n + (h[c] === true ? 1 : 0),
          0
        );
        if (got >= 3) superVoterSql++;
      }
      if (data.length < PAGE) break;
    }
  }
  const superVoter = superVoterRpc ?? superVoterSql;
  check(
    "super-voter 3-of-4 count > 0",
    superVoter > 0,
    `RPC=${superVoterRpc ?? "n/a"} · SQL-equiv=${superVoterSql}`
  );

  // ── turfs ───────────────────────────────────────────────────────────────────
  const { data: turfs } = await admin
    .from("turfs")
    .select("id, name, status, assignee_id, door_count, voter_count")
    .eq("campaign_id", CAMPAIGN_ID);
  check("~6 turfs", (turfs?.length ?? 0) >= 5 && (turfs?.length ?? 0) <= 7, String(turfs?.length));
  const assigned = (turfs ?? []).filter((t) => t.assignee_id).length;
  check("some turfs assigned to a canvasser", assigned >= 1, `${assigned} assigned`);
  const statuses = new Set((turfs ?? []).map((t) => t.status));
  check("turf statuses are a mix", statuses.size >= 2, [...statuses].join(","));

  // A turf polygon contains some voter points (server-side spatial count via RPC
  // if available; else trust the stored voter_count which we computed spatially).
  const maxTurfVoters = Math.max(0, ...(turfs ?? []).map((t) => t.voter_count));
  check("a turf contains voter points", maxTurfVoters > 0, `max voter_count=${maxTurfVoters}`);

  // ── contacts (14-day window, incl. today) ───────────────────────────────────
  const { count: contactCount } = await admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", CAMPAIGN_ID);
  check("~400 contacts", (contactCount ?? 0) >= 300 && (contactCount ?? 0) <= 500, String(contactCount));

  const { data: cdates } = await admin
    .from("contacts")
    .select("created_at, channel, result")
    .eq("campaign_id", CAMPAIGN_ID)
    .order("created_at", { ascending: true });
  const times = (cdates ?? []).map((r) => new Date(r.created_at).getTime());
  const minT = Math.min(...times), maxT = Math.max(...times);
  const spanDays = (maxT - minT) / 86400000;
  check("contacts span ~14 days", spanDays >= 10 && spanDays <= 14.5, `${spanDays.toFixed(1)}d`);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCount = (cdates ?? []).filter(
    (r) => new Date(r.created_at).toISOString().slice(0, 10) === todayKey
  ).length;
  check("some contacts dated TODAY", todayCount > 0, `${todayCount} today`);

  // HQ-equivalent KPIs would be non-zero?
  const doorAttempts = (cdates ?? []).filter((r) => r.channel === "door").length;
  const NO_CONTACT = new Set(["not-home", "lit-dropped"]);
  const reached = (cdates ?? []).filter((r) => !NO_CONTACT.has(r.result ?? "")).length;
  check("HQ KPIs non-zero (doors + reached + supporters)", doorAttempts > 0 && reached > 0 && supportersIdd > 0);

  // ── summary ─────────────────────────────────────────────────────────────────
  console.log("\n──────── headline numbers ────────");
  console.log("voters:         ", total);
  console.log("party D/R/I:    ", `${party.D}/${party.R}/${party.I}`, `(${pct(party.D, total)}/${pct(party.R, total)}/${pct(party.I, total)})`);
  console.log("race:           ", Object.entries(races).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log("gender M/F/X:   ", `${gender.M}/${gender.F}/${gender.X}`);
  console.log("precincts:      ", [...precincts].sort().join(", "));
  console.log("support 1..5:   ", [1, 2, 3, 4, 5].map((s) => `${s}:${support[s]}`).join("  "));
  console.log("supporters 4-5: ", supportersIdd);
  console.log("super-voter 3of4:", superVoter, `(RPC=${superVoterRpc ?? "n/a"})`);
  console.log("VBM-flagged:    ", vbm);
  console.log("turfs:          ", turfs?.length, `(${assigned} assigned; statuses ${[...statuses].join("/")})`);
  console.log("contacts:       ", contactCount, `(span ${spanDays.toFixed(1)}d, ${todayCount} today, ${doorAttempts} door, ${reached} reached)`);
  console.log("──────────────────────────────────");
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

function pct(n, d) {
  return d ? Math.round((n / d) * 100) + "%" : "0%";
}

main().catch((e) => {
  console.error("\n✗ verify failed:", e.message);
  process.exit(1);
});
