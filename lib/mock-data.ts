// lib/mock-data.ts — mock campaign data for the CANDI MVP.
// Swapped for Supabase queries (multi-tenant RLS) once the real voter file + keys land.
// Synthetic rows are generated with a seeded PRNG so server + client render identically (no hydration drift).

export type Party = "D" | "R" | "I";

export type Voter = {
  id: string;
  name: string;
  age: number;
  party: Party;
  precinct: string;
  addr: string;
  city: string;
  zip: string;
  support: number; // 1–5
  persuasion: number; // 0–5
  history: string; // e.g. "75% (3/4)"
  last: string; // last-contact label
  phone: string;
  flags: string[]; // persuadable | volunteer | donor | VBM | new
  race?: string; // White | Black | Hispanic/Latino | Asian | Other
  gender?: string; // M | F | X
  elections?: Record<string, boolean>; // per-election turnout, e.g. { "2024G": true, ... }
};

// Build the per-election history map from a "(got/total)" history string,
// filling the most-recent RECENT_ELECTIONS codes as voted first.
const ELECTION_CODES = ["2024G", "2022G", "2020G", "2018G"] as const;
function electionsFromHistory(history: string): Record<string, boolean> {
  const m = history.match(/(\d+)\s*\/\s*(\d+)/);
  const got = m ? parseInt(m[1]) : 0;
  const out: Record<string, boolean> = {};
  ELECTION_CODES.forEach((code, i) => (out[code] = i < got));
  return out;
}

export const CAMPAIGN = {
  candidate: "Mira Reyes",
  shortName: "Reyes",
  initials: "MR",
  office: "State Senate",
  district: "PA-12",
  party: "Independent",
  electionDate: "Nov 3, 2026",
  daysOut: 171,
  totalVoters: 412847,
};

// 22 hand-authored "hero" voters from the design — keeps the demo recognizable.
const HERO: Voter[] = [
  { id: "V-014823", name: "Aaliyah Henderson", age: 34, party: "D", precinct: "07N", addr: "2118 Centre Ave, Apt 4B", city: "Pittsburgh", zip: "15219", support: 5, history: "100% (4/4)", last: "Door · 3d", phone: "(412) 555-0182", flags: ["volunteer"], persuasion: 0 },
  { id: "V-014824", name: "Marcus Whitfield", age: 58, party: "R", precinct: "07N", addr: "414 Ellsworth Ave", city: "Pittsburgh", zip: "15213", support: 1, history: "100% (4/4)", last: "—", phone: "(412) 555-0144", flags: [], persuasion: 1 },
  { id: "V-014825", name: "Priya Raman", age: 29, party: "I", precinct: "07N", addr: "5500 Walnut St, #312", city: "Pittsburgh", zip: "15232", support: 3, history: "75% (3/4)", last: "Text · 1d", phone: "(412) 555-0317", flags: ["persuadable"], persuasion: 4 },
  { id: "V-014826", name: "Daniel O'Connor", age: 71, party: "D", precinct: "12S", addr: "1227 Sheridan Ave", city: "Pittsburgh", zip: "15206", support: 4, history: "100% (4/4)", last: "Call · 5d", phone: "(412) 555-0288", flags: ["VBM"], persuasion: 2 },
  { id: "V-014827", name: "Yuki Tanaka", age: 41, party: "D", precinct: "12S", addr: "639 N Negley Ave", city: "Pittsburgh", zip: "15206", support: 5, history: "100% (4/4)", last: "Door · 2d", phone: "(412) 555-0119", flags: ["donor"], persuasion: 0 },
  { id: "V-014828", name: "Brandon Kim", age: 23, party: "I", precinct: "12S", addr: "1812 E Carson St", city: "Pittsburgh", zip: "15203", support: 3, history: "50% (2/4)", last: "Text · 7h", phone: "(412) 555-0291", flags: ["persuadable"], persuasion: 5 },
  { id: "V-014829", name: "Helena Vasquez", age: 67, party: "D", precinct: "03W", addr: "2240 Beechwood Blvd", city: "Pittsburgh", zip: "15217", support: 4, history: "100% (4/4)", last: "Mail · 11d", phone: "(412) 555-0204", flags: ["VBM"], persuasion: 1 },
  { id: "V-014830", name: "Theo Albright", age: 36, party: "R", precinct: "03W", addr: "1109 Murray Ave", city: "Pittsburgh", zip: "15217", support: 2, history: "75% (3/4)", last: "Door · 1d", phone: "(412) 555-0185", flags: [], persuasion: 3 },
  { id: "V-014831", name: "Imani Bell", age: 28, party: "D", precinct: "03W", addr: "5621 Hobart St", city: "Pittsburgh", zip: "15217", support: 5, history: "100% (4/4)", last: "Event · 4d", phone: "(412) 555-0173", flags: ["volunteer", "donor"], persuasion: 0 },
  { id: "V-014832", name: "Robert Petrosian", age: 62, party: "R", precinct: "14E", addr: "318 Highland Ave", city: "Pittsburgh", zip: "15206", support: 1, history: "100% (4/4)", last: "—", phone: "(412) 555-0156", flags: [], persuasion: 0 },
  { id: "V-014833", name: "Sofia Mendoza", age: 45, party: "I", precinct: "14E", addr: "732 Stanton Ave", city: "Pittsburgh", zip: "15201", support: 4, history: "75% (3/4)", last: "Text · 12h", phone: "(412) 555-0263", flags: ["persuadable"], persuasion: 4 },
  { id: "V-014834", name: "Kenji Park", age: 31, party: "D", precinct: "14E", addr: "5031 Penn Ave", city: "Pittsburgh", zip: "15224", support: 5, history: "75% (3/4)", last: "Door · today", phone: "(412) 555-0298", flags: ["volunteer"], persuasion: 0 },
  { id: "V-014835", name: "Margaret Sullivan", age: 78, party: "R", precinct: "07N", addr: "927 Lincoln Ave", city: "Pittsburgh", zip: "15206", support: 2, history: "100% (4/4)", last: "Call · 2d", phone: "(412) 555-0118", flags: [], persuasion: 3 },
  { id: "V-014836", name: "Jamal Wright", age: 39, party: "D", precinct: "12S", addr: "1505 W North Ave", city: "Pittsburgh", zip: "15233", support: 3, history: "50% (2/4)", last: "Text · 3d", phone: "(412) 555-0144", flags: [], persuasion: 4 },
  { id: "V-014837", name: "Naomi Eisner", age: 52, party: "D", precinct: "03W", addr: "5847 Forbes Ave", city: "Pittsburgh", zip: "15217", support: 4, history: "100% (4/4)", last: "Mail · 8d", phone: "(412) 555-0212", flags: ["donor"], persuasion: 2 },
  { id: "V-014838", name: "Connor McLeod", age: 24, party: "I", precinct: "14E", addr: "224 N Craig St", city: "Pittsburgh", zip: "15213", support: 3, history: "25% (1/4)", last: "—", phone: "(412) 555-0299", flags: ["persuadable"], persuasion: 5 },
  { id: "V-014839", name: "Felicia Brooks", age: 49, party: "D", precinct: "07N", addr: "320 Atwood St", city: "Pittsburgh", zip: "15213", support: 5, history: "100% (4/4)", last: "Door · 1d", phone: "(412) 555-0167", flags: ["donor"], persuasion: 0 },
  { id: "V-014840", name: "Ethan Crowley", age: 33, party: "R", precinct: "12S", addr: "1808 Sarah St", city: "Pittsburgh", zip: "15203", support: 2, history: "50% (2/4)", last: "Door · 4d", phone: "(412) 555-0182", flags: [], persuasion: 3 },
  { id: "V-014841", name: "Lucia Ferrari", age: 27, party: "D", precinct: "03W", addr: "5128 Bigelow Blvd", city: "Pittsburgh", zip: "15213", support: 4, history: "50% (2/4)", last: "Text · 6h", phone: "(412) 555-0234", flags: ["persuadable"], persuasion: 4 },
  { id: "V-014842", name: "Marcus Dvořák", age: 64, party: "I", precinct: "14E", addr: "121 N Pacific Ave", city: "Pittsburgh", zip: "15224", support: 3, history: "100% (4/4)", last: "Call · 3d", phone: "(412) 555-0145", flags: ["persuadable"], persuasion: 3 },
  { id: "V-014843", name: "Eleanor Pham", age: 70, party: "D", precinct: "07N", addr: "2300 Bayard St", city: "Pittsburgh", zip: "15213", support: 4, history: "100% (4/4)", last: "VBM · 14d", phone: "(412) 555-0166", flags: ["VBM"], persuasion: 1 },
  { id: "V-014844", name: "Trevor Maddox", age: 19, party: "I", precinct: "12S", addr: "1409 E Carson St", city: "Pittsburgh", zip: "15203", support: 3, history: "0% (0/1)", last: "Door · today", phone: "(412) 555-0288", flags: ["persuadable", "new"], persuasion: 5 },
];

// Plausible, deterministic race/gender for the hand-authored hero rows so the
// new demographic facets have data without re-authoring all 22 literals.
function heroHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function enrichHero(v: Voter): Voter {
  const h = heroHash(v.id);
  const rb = h % 100;
  const race =
    rb < 38 ? "White" : rb < 68 ? "Black" : rb < 90 ? "Hispanic/Latino" : rb < 95 ? "Asian" : "Other";
  const gb = (h >>> 7) % 100;
  const gender = gb < 48 ? "M" : gb < 97 ? "F" : "X";
  return { ...v, race, gender, elections: electionsFromHistory(v.history) };
}

// ── deterministic synthetic fill (seeded) ────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["James", "Maria", "David", "Linda", "Andre", "Grace", "Omar", "Chloe", "Wei", "Tanya", "Luis", "Nadia", "Caleb", "Ruth", "Diego", "Hana", "Isaac", "Priya", "Noah", "Zara", "Elena", "Trent", "Maya", "Owen", "Layla"];
const LAST = ["Nguyen", "Carter", "Flores", "Brooks", "Patel", "Reed", "Murphy", "Cohen", "Diaz", "Walsh", "Okafor", "Romano", "Bauer", "Singh", "Hughes", "Lozano", "Foster", "Khan", "Berg", "Ali", "Tucker", "Mercer", "Vance", "Ortiz", "Hale"];
const STREETS = ["Penn Ave", "Forbes Ave", "Liberty Ave", "Negley Ave", "Highland Ave", "Murray Ave", "Carson St", "Butler St", "Walnut St", "Centre Ave", "Fifth Ave", "Baum Blvd", "Stanton Ave", "Atwood St", "Craig St"];
const PRECINCTS = ["07N", "12S", "03W", "14E", "05N", "09S", "11W", "16E", "02N", "18S"];
const ZIPS = ["15213", "15217", "15206", "15203", "15219", "15232", "15224", "15201", "15233", "15222"];
const LASTS = ["Door · 3d", "Text · 1d", "—", "—", "Call · 5d", "Mail · 8d", "Door · today", "Text · 12h", "VBM · 14d"];

function genVoters(n: number, startNum: number): Voter[] {
  const rng = mulberry32(20260530);
  const out: Voter[] = [];
  for (let i = 0; i < n; i++) {
    const r = rng();
    const party: Party = r < 0.45 ? "D" : r < 0.82 ? "R" : "I";
    const support = 1 + Math.floor(rng() * 5);
    const persuasion =
      support === 3 ? 3 + Math.floor(rng() * 3) : support <= 2 || support >= 5 ? Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3);
    const flags: string[] = [];
    if (persuasion >= 4) flags.push("persuadable");
    if (rng() < 0.06) flags.push("volunteer");
    if (rng() < 0.05) flags.push("donor");
    if (rng() < 0.07) flags.push("VBM");
    const num = startNum + i;
    const age = 18 + Math.floor(rng() * 68);
    // Age-boosted per-election turnout (older → likelier), older cycles decay a
    // little. Thresholds mirror the SQL backfill so ~25-35% clear 3-of-4.
    const boost = Math.min(age, 80) * 0.0035;
    const elections: Record<string, boolean> = {
      "2024G": rng() < 0.52 + boost,
      "2022G": rng() < 0.48 + boost,
      "2020G": rng() < 0.44 + boost,
      "2018G": rng() < 0.4 + boost,
    };
    const got = Object.values(elections).filter(Boolean).length;
    const history = `${Math.round((got / 4) * 100)}% (${got}/4)`;
    // Race: Broward-leaning plausible mix. Gender: M/F/X.
    const rb = rng();
    const race =
      rb < 0.38 ? "White" : rb < 0.68 ? "Black" : rb < 0.9 ? "Hispanic/Latino" : rb < 0.95 ? "Asian" : "Other";
    const gb = rng();
    const gender = gb < 0.48 ? "M" : gb < 0.97 ? "F" : "X";
    out.push({
      id: `V-0${14845 + i}`,
      name: `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`,
      age,
      party,
      precinct: PRECINCTS[Math.floor(rng() * PRECINCTS.length)],
      addr: `${100 + Math.floor(rng() * 8900)} ${STREETS[Math.floor(rng() * STREETS.length)]}`,
      city: "Pittsburgh",
      zip: ZIPS[Math.floor(rng() * ZIPS.length)],
      race,
      gender,
      elections,
      support,
      persuasion,
      history,
      last: LASTS[Math.floor(rng() * LASTS.length)],
      phone: `(412) 555-0${100 + Math.floor(rng() * 899)}`,
      flags,
    });
    void num;
  }
  return out;
}

export const VOTERS: Voter[] = [...HERO.map(enrichHero), ...genVoters(1980, HERO.length)];

export const partyLabel = (p: Party) => (p === "D" ? "Dem" : p === "R" ? "Rep" : "Ind");
export const partyFull = (p: Party) => (p === "D" ? "Democrat" : p === "R" ? "Republican" : "Independent");
export const partyTag = (p: Party) => (p === "D" ? "dem" : p === "R" ? "rep" : "ind");

// ── Texting threads (mock) ───────────────────────────────────────────────────
export type Msg = { who: "us" | "them"; t: string; text: string };
export type Thread = {
  id: string; voter: string; party: Party | "—"; phone: string; precinct: string;
  unread: number; lastT: string; support: number; persuasion: number;
  flags: string[]; snippet: string; messages: Msg[];
};

export const THREADS: Thread[] = [
  { id: "th1", voter: "Aaliyah Henderson", party: "D", phone: "(412) 555-0182", precinct: "07N", unread: 2, lastT: "11:42 AM", support: 5, persuasion: 0, flags: ["volunteer"], snippet: "Yes — I can volunteer Saturday. What time?", messages: [
    { who: "us", t: "11:31 AM", text: "Hi Aaliyah, it's Sam with Reyes for State Senate. We saw you helped phonebank last cycle — would you be open to canvassing this Saturday in your neighborhood?" },
    { who: "them", t: "11:39 AM", text: "Hey Sam, yes — I can volunteer Saturday. What time?" },
    { who: "them", t: "11:42 AM", text: "Also, my neighbor across the hall might come too." },
  ] },
  { id: "th2", voter: "Priya Raman", party: "I", phone: "(412) 555-0317", precinct: "07N", unread: 1, lastT: "11:28 AM", support: 3, persuasion: 4, flags: ["persuadable"], snippet: "What's her position on transit funding?", messages: [
    { who: "us", t: "10:14 AM", text: "Hi Priya — Mira Reyes here, running for State Senate in PA-12. I'd love to know what issues matter most to you this cycle." },
    { who: "them", t: "11:28 AM", text: "What's her position on transit funding?" },
  ] },
  { id: "th3", voter: "Brandon Kim", party: "I", phone: "(412) 555-0291", precinct: "12S", unread: 0, lastT: "10:51 AM", support: 3, persuasion: 5, flags: ["persuadable"], snippet: "Tell me more about housing.", messages: [
    { who: "us", t: "09:30 AM", text: "Hi Brandon — checking in from the Reyes campaign. Any issues on your mind for this November?" },
    { who: "them", t: "10:01 AM", text: "Rent. It's brutal." },
    { who: "us", t: "10:18 AM", text: "Totally hear you. Mira's been pushing for the renter relief act and expanding LIHTC in PA. Want me to send her plan?" },
    { who: "them", t: "10:51 AM", text: "Tell me more about housing." },
  ] },
  { id: "th4", voter: "Sofia Mendoza", party: "I", phone: "(412) 555-0263", precinct: "14E", unread: 0, lastT: "Yesterday", support: 4, persuasion: 4, flags: ["persuadable"], snippet: "Thanks, I'll be there.", messages: [
    { who: "us", t: "Yesterday 4:02 PM", text: "Hi Sofia — Mira's hosting a meet-and-greet Thursday at 6 PM, Spirit Hall in Lawrenceville. Want to come?" },
    { who: "them", t: "Yesterday 5:47 PM", text: "Thanks, I'll be there." },
  ] },
  { id: "th5", voter: "Trevor Maddox", party: "I", phone: "(412) 555-0288", precinct: "12S", unread: 1, lastT: "10:14 AM", support: 3, persuasion: 5, flags: ["persuadable", "new"], snippet: "is this a real person", messages: [
    { who: "us", t: "10:02 AM", text: "Hi Trevor, it's Sam with Reyes for State Senate. Welcome to the rolls! Any issues on your mind?" },
    { who: "them", t: "10:14 AM", text: "is this a real person" },
  ] },
  { id: "th6", voter: "Marcus Dvořák", party: "I", phone: "(412) 555-0145", precinct: "14E", unread: 0, lastT: "Wed", support: 3, persuasion: 3, flags: [], snippet: "Remove me from this list.", messages: [
    { who: "them", t: "Wed 2:11 PM", text: "Remove me from this list." },
  ] },
  { id: "th7", voter: "Jamal Wright (volunteer)", party: "—", phone: "(412) 555-0144", precinct: "—", unread: 0, lastT: "Tue", support: 5, persuasion: 0, flags: ["volunteer"], snippet: "Got it, I'll grab T-12S-A.", messages: [
    { who: "us", t: "Tue 7:01 AM", text: "Morning Jamal — your turf today is T-12S-A. Synced to your app." },
    { who: "them", t: "Tue 7:14 AM", text: "Got it, I'll grab T-12S-A." },
  ] },
];

export const AI_REPLIES: Record<string, string[]> = {
  th1: ["🎯 Confirm Sat 10 AM, send turf address", "Bring a friend — invite the neighbor", "Share volunteer signup link"],
  th2: ["Send Mira's transit plan (1-pager)", "Highlight $400M state-rail allocation", "Offer 5-min phone follow-up"],
  th3: ["Send housing policy 1-pager", "Mention LIHTC expansion + renter relief", "Offer Q&A at Thu meet-and-greet"],
  th5: ["Confirm real campaign, share staff name", "Send link to campaign website", "Switch to lighter tone, ask one question"],
};

// ── Turfs + live canvassers (mock) ───────────────────────────────────────────
export type Turf = {
  id: string; name: string; doors: number; knocked: number; contacts: number;
  support: number; assignee: string; status: "active" | "complete" | "queued"; eta: string; color: string;
};
export type Canvasser = {
  id: number; name: string; initials: string; turf: string; doors: number; contacts: number;
  status: "live" | "done" | "paused"; last: string; battery: number;
};

export const TURFS: Turf[] = [
  { id: "T-07N-A", name: "07N · Centre / Craig", doors: 142, knocked: 98, contacts: 71, support: 0.62, assignee: "Imani B.", status: "active", eta: "32 min", color: "var(--accent)" },
  { id: "T-07N-B", name: "07N · Atwood / Bayard", doors: 118, knocked: 118, contacts: 84, support: 0.71, assignee: "Kenji P.", status: "complete", eta: "—", color: "var(--teal)" },
  { id: "T-12S-A", name: "12S · E Carson East", doors: 165, knocked: 22, contacts: 14, support: 0.43, assignee: "Jamal W.", status: "active", eta: "2h 10m", color: "var(--indigo)" },
  { id: "T-12S-B", name: "12S · Sarah / Sidney", doors: 134, knocked: 0, contacts: 0, support: 0, assignee: "Unassigned", status: "queued", eta: "—", color: "var(--mute-2)" },
  { id: "T-03W-A", name: "03W · Murray Square", doors: 156, knocked: 89, contacts: 67, support: 0.69, assignee: "Felicia B.", status: "active", eta: "1h 5m", color: "var(--amber)" },
  { id: "T-03W-B", name: "03W · Forbes / Beech.", doors: 122, knocked: 122, contacts: 91, support: 0.74, assignee: "Lucia F.", status: "complete", eta: "—", color: "var(--teal)" },
  { id: "T-14E-A", name: "14E · Penn / Highland", doors: 178, knocked: 51, contacts: 38, support: 0.55, assignee: "Connor M.", status: "active", eta: "1h 47m", color: "var(--rose)" },
  { id: "T-14E-B", name: "14E · N Craig / Bayard", doors: 109, knocked: 0, contacts: 0, support: 0, assignee: "Unassigned", status: "queued", eta: "—", color: "var(--mute-2)" },
];

export const CANVASSERS: Canvasser[] = [
  { id: 1, name: "Imani Bell", initials: "IB", turf: "T-07N-A", doors: 98, contacts: 71, status: "live", last: "Just now", battery: 78 },
  { id: 2, name: "Kenji Park", initials: "KP", turf: "T-07N-B", doors: 118, contacts: 84, status: "done", last: "12 min", battery: 41 },
  { id: 3, name: "Jamal Wright", initials: "JW", turf: "T-12S-A", doors: 22, contacts: 14, status: "live", last: "2 min", battery: 64 },
  { id: 4, name: "Felicia Brooks", initials: "FB", turf: "T-03W-A", doors: 89, contacts: 67, status: "live", last: "Just now", battery: 55 },
  { id: 5, name: "Lucia Ferrari", initials: "LF", turf: "T-03W-B", doors: 122, contacts: 91, status: "done", last: "47 min", battery: 22 },
  { id: 6, name: "Connor McLeod", initials: "CM", turf: "T-14E-A", doors: 51, contacts: 38, status: "paused", last: "8 min", battery: 31 },
];

// ── Script tree (mock) ───────────────────────────────────────────────────────
export type ScriptBranch = { label: string; to: string; tone: "good" | "warn" | "bad" | "neutral" };
export type ScriptNode = { kind: "say" | "ask" | "action"; title: string; body: string; next?: string | null; branches?: ScriptBranch[] };
export type Script = { name: string; nodes: Record<string, ScriptNode>; rootOrder: string[] };

export const SCRIPT: Script = {
  name: "Standard Canvass · v3.2",
  nodes: {
    intro: { kind: "say", title: "Greet at door", body: "Hi! My name is [VOLUNTEER]. I'm a volunteer with Mira Reyes, who's running for State Senate. Do you have 2 minutes?", next: "ask_support" },
    ask_support: { kind: "ask", title: "Identify support", body: "On a scale of 1 to 5, how likely are you to vote for Mira Reyes this November?", branches: [
      { label: "5 — Strong support", to: "strong", tone: "good" },
      { label: "3–4 — Lean support", to: "lean", tone: "good" },
      { label: "2 — Lean opposed", to: "persuadable", tone: "warn" },
      { label: "1 — Strong opposed", to: "thanks_out", tone: "bad" },
      { label: "Not sure", to: "persuadable", tone: "neutral" },
    ] },
    strong: { kind: "say", title: "Volunteer ask", body: "Amazing! Would you be open to volunteering Saturday in your neighborhood — even one hour helps.", next: "vbm" },
    lean: { kind: "say", title: "Reinforce + VBM", body: "Thank you. Mira's top priorities are transit, housing, and public schools. Have you requested a mail ballot yet?", next: "vbm" },
    persuadable: { kind: "ask", title: "Find their issue", body: "What's the issue you most want her to focus on?", branches: [
      { label: "Housing", to: "p_housing", tone: "neutral" },
      { label: "Schools", to: "p_schools", tone: "neutral" },
      { label: "Transit", to: "p_transit", tone: "neutral" },
      { label: "Other", to: "p_other", tone: "neutral" },
    ] },
    p_housing: { kind: "say", title: "Housing talking point", body: "Mira authored the renter relief act last session. Capping rent hikes for seniors and expanding LIHTC. Want me to send her plan?", next: "vbm" },
    p_schools: { kind: "say", title: "Schools talking point", body: "She's been on the PSEA endorsement list two cycles running and is pushing for full PA Charter Reform.", next: "vbm" },
    p_transit: { kind: "say", title: "Transit talking point", body: "She secured the $400M state-rail allocation in last year's budget — Port Authority is named in the bill.", next: "vbm" },
    p_other: { kind: "ask", title: "Capture the issue", body: "Got it. Mind if I write that down for her policy team?", branches: [
      { label: "Sure", to: "vbm", tone: "good" },
      { label: "Pass", to: "thanks", tone: "neutral" },
    ] },
    vbm: { kind: "ask", title: "Mail ballot ask", body: "Have you requested a mail-in ballot for November?", branches: [
      { label: "Yes", to: "thanks", tone: "good" },
      { label: "No — interested", to: "vbm_form", tone: "good" },
      { label: "No — not now", to: "thanks", tone: "neutral" },
    ] },
    vbm_form: { kind: "action", title: "Capture VBM signup", body: "Open VBM form · auto-fill from voter record · take signature on device.", next: "thanks" },
    thanks: { kind: "say", title: "Wrap up", body: "Thank you so much for your time. Election is November 3 — please make a plan to vote!", next: null },
    thanks_out: { kind: "say", title: "Wrap up (opposed)", body: "Appreciate your time. Have a great day.", next: null },
  },
  rootOrder: ["intro", "ask_support", "lean", "strong", "persuadable", "p_housing", "p_schools", "p_transit", "p_other", "vbm", "vbm_form", "thanks", "thanks_out"],
};
