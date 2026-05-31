import { redirect } from "next/navigation";
import { Filter, Calendar } from "lucide-react";
import { getRole, isAdminRole } from "@/lib/auth";
import { getActiveCampaign, getActiveCampaignId } from "@/lib/campaign";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ElectionCallout } from "@/components/election-callout";
import { KnockVelocity } from "@/components/hq/knock-velocity";

export const dynamic = "force-dynamic";

// ── static (later AI feature) ────────────────────────────────────────────────
// "Candi suggests" stays static for now — wiring it to the modeling/AI pipeline
// is a separate feature. Flagged "Preview" in the UI so it reads as not-yet-live.
const suggestions = [
  {
    c: 0.86,
    title: "Re-canvass Precinct 12S tomorrow AM",
    body: "67% of 12S doors were not-home 2–5 PM. Modeled response jumps to 41% at 10 AM Saturday.",
    tags: ["Turf", "Modeling"],
  },
  {
    c: 0.79,
    title: "Move 220 renters to the renter-relief script",
    body: "High-persuasion renters in 07N respond better to housing messaging than the default.",
    tags: ["Script", "Persuasion"],
  },
  {
    c: 0.72,
    title: "Text 480 outstanding VBM ballots",
    body: "Chase vote-by-mail no-returns before the weekend to lift the 25% return rate.",
    tags: ["Texting", "GOTV"],
  },
];

const DAY_MS = 86_400_000;
const SERIES_DAYS = 14;

const nf = new Intl.NumberFormat("en-US");

/** Local YYYY-MM-DD key for a date (matches how created_at is bucketed). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

type ContactRow = {
  channel: string | null;
  result: string | null;
  support: number | null;
  canvasser_id: string | null;
  created_at: string;
};

export default async function HQPage() {
  // HQ is the campaign command center — owners/directors only.
  if (!isAdminRole(await getRole())) redirect("/canvassing");

  const supabase = await createClient();
  const campaign = await getActiveCampaign();
  const campaignId = (await getActiveCampaignId()) ?? "default";

  // ── Live aggregates, all RLS-scoped to the active campaign ──────────────────
  // Window: contacts from the last 14 days (today inclusive) for the chart + KPIs.
  const since = new Date(Date.now() - (SERIES_DAYS - 1) * DAY_MS);
  since.setHours(0, 0, 0, 0);

  // Run the independent reads in parallel.
  const [contactsRes, supportersRes, vbmRes, turfsRes, canvasserMemRes] = campaign
    ? await Promise.all([
        // Recent contacts power KPIs (doors today, contact rate) + the 14-day series.
        supabase
          .from("contacts")
          .select("channel, result, support, canvasser_id, created_at")
          .eq("campaign_id", campaign.id)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: true })
          .limit(5000),
        // Supporters ID'd = voters scored 4–5 (campaign-wide, the PRD's primary def).
        supabase
          .from("voters")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .gte("support", 4),
        // VBM proxy = voters flagged 'VBM' (keeps the existing card's intent).
        supabase
          .from("voters")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .contains("flags", ["VBM"]),
        // Turfs for canvasser assignment + completion context.
        supabase
          .from("turfs")
          .select("id, name, status, assignee_id, door_count")
          .eq("campaign_id", campaign.id),
        // Canvassers in this campaign's org (memberships RLS allows same-org rows).
        supabase
          .from("memberships")
          .select("id, user_id, role")
          .eq("org_id", campaign.org_id)
          .eq("role", "canvasser"),
      ])
    : [
        { data: [] as ContactRow[] },
        { count: 0 },
        { count: 0 },
        { data: [] as { id: string; name: string; status: string; assignee_id: string | null; door_count: number }[] },
        { data: [] as { id: string; user_id: string; role: string }[] },
      ];

  const contacts = (contactsRes.data ?? []) as ContactRow[];

  // Today's bucket key (local).
  const todayKey = dayKey(new Date());

  const isSupport = (r: ContactRow) => r.result === "supporter" || (r.support ?? 0) >= 4;

  // KPI: doors knocked today, contacts made, contact rate (contacts / door-attempts).
  let doorsToday = 0;
  let doorAttempts = 0;
  for (const r of contacts) {
    const isDoor = r.channel === "door";
    if (isDoor) doorAttempts++;
    if (isDoor && dayKey(new Date(r.created_at)) === todayKey) doorsToday++;
  }
  const contactsMade = contacts.length;
  const contactRate = doorAttempts > 0 ? Math.round((contactsMade / doorAttempts) * 100) : 0;

  const supportersIdd = supportersRes.count ?? 0;
  const vbmReturned = vbmRes.count ?? 0;

  // ── 14-day series (doors / contacts / support) bucketed by day ──────────────
  const dayKeys: string[] = [];
  const labels: string[] = [];
  const idx = new Map<string, number>();
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    const k = dayKey(d);
    idx.set(k, dayKeys.length);
    dayKeys.push(k);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  const doorsSeries = new Array(SERIES_DAYS).fill(0);
  const contactsSeries = new Array(SERIES_DAYS).fill(0);
  const supportSeries = new Array(SERIES_DAYS).fill(0);
  for (const r of contacts) {
    const i = idx.get(dayKey(new Date(r.created_at)));
    if (i === undefined) continue;
    contactsSeries[i]++;
    if (r.channel === "door") doorsSeries[i]++;
    if (isSupport(r)) supportSeries[i]++;
  }

  // ── Canvassers in field ─────────────────────────────────────────────────────
  // door counts (last 14d) per canvasser membership, from the same contact set.
  const doorsByCanvasser = new Map<string, number>();
  for (const r of contacts) {
    if (r.channel !== "door" || !r.canvasser_id) continue;
    doorsByCanvasser.set(r.canvasser_id, (doorsByCanvasser.get(r.canvasser_id) ?? 0) + 1);
  }
  const turfsList = (turfsRes.data ?? []) as {
    id: string;
    name: string;
    status: string;
    assignee_id: string | null;
    door_count: number;
  }[];
  const turfByAssignee = new Map<string, { name: string; status: string }>();
  for (const t of turfsList) {
    if (t.assignee_id && !turfByAssignee.has(t.assignee_id)) {
      turfByAssignee.set(t.assignee_id, { name: t.name, status: t.status });
    }
  }

  const canvasserMems = (canvasserMemRes.data ?? []) as {
    id: string;
    user_id: string;
    role: string;
  }[];

  // Resolve display names from auth emails. The RLS (authenticated) client cannot
  // read auth.users, so we use the trusted server (service-role) client purely to
  // map user_id → email for display; row scoping still comes from RLS above.
  const nameById = new Map<string, string>();
  if (canvasserMems.length > 0) {
    try {
      const admin = createAdminClient();
      await Promise.all(
        canvasserMems.map(async (m) => {
          const { data } = await admin.auth.admin.getUserById(m.user_id);
          const email = data?.user?.email ?? "";
          nameById.set(m.id, emailToName(email));
        })
      );
    } catch {
      /* email lookup unavailable — fall back to a placeholder below */
    }
  }

  const canvassers = canvasserMems
    .map((m) => {
      const name = nameById.get(m.id) || "Canvasser";
      const turf = turfByAssignee.get(m.id);
      return {
        id: m.id,
        name,
        initials: initialsOf(name),
        turf: turf ? `${turf.name}${turf.status === "active" ? " · active" : ""}` : "Unassigned",
        doors: doorsByCanvasser.get(m.id) ?? 0,
      };
    })
    .sort((a, b) => b.doors - a.doors);

  // Election callout values from the active campaign (fall back to the mock copy).
  const electionDate = campaign?.election_date ? new Date(campaign.election_date) : null;
  const daysLeft = electionDate
    ? Math.max(0, Math.ceil((electionDate.getTime() - Date.now()) / DAY_MS))
    : 171;
  const dateLabel = electionDate
    ? electionDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Nov 3";

  return (
    <div className="hq">
      <div className="module-head">
        <h1>HQ Dashboard</h1>
        <div className="sub">
          {campaign ? `${campaign.candidate}${campaign.office ? ` · ${campaign.office}` : ""}` : "No campaign selected"}
          {electionDate ? ` · ${daysLeft} days to election` : ""}
        </div>
        <div className="acts">
          <button className="btn" type="button"><Filter className="ico" /> Filter</button>
          <button className="btn" type="button"><Calendar className="ico" /> Today</button>
        </div>
      </div>

      <div className="hq-body">
        <ElectionCallout daysLeft={daysLeft} dateLabel={dateLabel} cyclePct={68} campaignId={campaignId} />

        <div className="kpi-row">
          <div className="kpi">
            <div className="label">Doors knocked · today</div>
            <div className="big">{nf.format(doorsToday)}</div>
            <div className="delta">last 14d: {nf.format(doorAttempts)} door attempts</div>
          </div>
          <div className="kpi">
            <div className="label">Contacts made · 14d</div>
            <div className="big">
              {nf.format(contactsMade)}
              <span className="unit">/ {contactRate}% of doors</span>
            </div>
            <div className="delta">contact rate</div>
          </div>
          <div className="kpi">
            <div className="label">Supporters ID&apos;d</div>
            <div className="big">{nf.format(supportersIdd)}<span className="unit">· 4–5 score</span></div>
            <div className="delta">this cycle</div>
          </div>
          <div className="kpi">
            <div className="label">VBM flagged</div>
            <div className="big">{nf.format(vbmReturned)}</div>
            <div className="delta">vote-by-mail voters</div>
          </div>
        </div>

        <div className="hq-grid">
          <KnockVelocity
            days={labels}
            doors={doorsSeries}
            contacts={contactsSeries}
            support={supportSeries}
          />

          <div className="card ai">
            <div className="card-head">
              <span className="ai-mark">AI</span>
              <h3>Candi suggests</h3>
              <span className="sub">· {suggestions.length} actions</span>
              <span className="tag" style={{ marginLeft: "auto" }}>Preview</span>
            </div>
            <div className="card-body flush">
              {suggestions.map((s) => (
                <div className="insight" key={s.title}>
                  <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                    <div className="conf-ring" style={{ ["--c"]: s.c } as React.CSSProperties}>
                      <span>{Math.round(s.c * 100)}</span>
                    </div>
                    <div className="col" style={{ gap: 6, minWidth: 0 }}>
                      <b style={{ fontSize: 13 }}>{s.title}</b>
                      <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{s.body}</span>
                      <div className="row" style={{ gap: 6, marginTop: 2 }}>
                        {s.tags.map((t) => (
                          <span className="tag" key={t}>{t}</span>
                        ))}
                        <span className="ai-suggest ghost" style={{ marginLeft: "auto" }}>Dismiss</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card hq-vbm">
            <div className="card-head">
              <h3>Canvassers in field</h3>
              <span className="sub">· {canvassers.length} {canvassers.length === 1 ? "canvasser" : "canvassers"}</span>
              {canvassers.length > 0 && <span className="dot live" style={{ marginLeft: 2 }} />}
            </div>
            <div className="card-body flush">
              {canvassers.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5, padding: "20px 16px" }}>
                  No canvassers assigned to this campaign yet.
                </div>
              ) : (
                canvassers.map((c) => (
                  <div className="canv-row" key={c.id}>
                    <div className="avatar">{c.initials}</div>
                    <div className="col" style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 12.5 }}>{c.name}</b>
                      <span className="muted" style={{ fontSize: 11.5 }}>{c.turf}</span>
                    </div>
                    <span className="mono" style={{ width: 86, textAlign: "right", color: "var(--ink-2)" }}>
                      {nf.format(c.doors)} doors
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "diego.reyes@candi.app" → "Diego Reyes"; "canvasser@candi.app" → "Canvasser". */
function emailToName(email: string): string {
  const local = (email.split("@")[0] ?? "").trim();
  if (!local) return "Canvasser";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
