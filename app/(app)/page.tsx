import { redirect } from "next/navigation";
import { Footprints, MessageSquare, ThumbsUp, Mail } from "lucide-react";
import { getRole, isAdminRole } from "@/lib/auth";
import { getActiveCampaign, getActiveCampaignId } from "@/lib/campaign";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ElectionCallout } from "@/components/election-callout";
import { KnockVelocity, type ContactPoint } from "@/components/hq/knock-velocity";
import { CandiSuggests } from "@/components/hq/candi-suggests";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

// Hard cap on contacts fetched for the chart/KPIs. The PRD's "SQL aggregate at
// scale" note still stands — at large campaign sizes this should move to a
// server-side aggregate; for now we cap the raw fetch so we never ship 400k rows.
const CONTACTS_CAP = 5000;

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
  // Run the independent reads in parallel.
  const [contactsRes, supportersRes, vbmRes, turfsRes, canvasserMemRes] = campaign
    ? await Promise.all([
        // The campaign's contacts power the KPIs and the client-side
        // range-bucketed chart. Capped at CONTACTS_CAP and ordered newest-first
        // so a very active campaign keeps its most-recent activity (the chart
        // buckets by date regardless of row order). See the cap note above.
        supabase
          .from("contacts")
          .select("channel, result, support, canvasser_id, created_at")
          .eq("campaign_id", campaign.id)
          .order("created_at", { ascending: false })
          .limit(CONTACTS_CAP),
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
  if (contacts.length >= CONTACTS_CAP) {
    // We hit the fetch cap — the chart/KPIs reflect the most-recent CONTACTS_CAP
    // rows. At this scale this should move to a SQL aggregate (see PRD).
    console.warn(
      `HQ: contacts fetch hit the ${CONTACTS_CAP}-row cap for campaign ${campaign?.id}; ` +
        `chart/KPIs are computed over the capped set.`
    );
  }

  // Today's bucket key (local).
  const todayKey = dayKey(new Date());

  // A contact is "made" only when someone was actually reached. Attempts that
  // didn't reach a person ('not-home') or just dropped literature ('lit-dropped')
  // don't count, so the rate reflects real conversations, not door-knocks.
  const NO_CONTACT_RESULTS = new Set(["not-home", "lit-dropped"]);
  const isReached = (r: ContactRow) => !NO_CONTACT_RESULTS.has(r.result ?? "");

  // KPI scalars, computed over the full fetched (capped) contact set.
  // doors today = door attempts dated today; contacts made = total reached;
  // contact rate = door-reached / door-attempts.
  let doorsToday = 0;
  let doorAttempts = 0;
  let doorsReached = 0;
  for (const r of contacts) {
    const isDoor = r.channel === "door";
    if (isDoor) {
      doorAttempts++;
      if (isReached(r)) doorsReached++;
      if (dayKey(new Date(r.created_at)) === todayKey) doorsToday++;
    }
  }
  const contactsMade = contacts.reduce((n, r) => n + (isReached(r) ? 1 : 0), 0);
  const contactRate = doorAttempts > 0 ? Math.round((doorsReached / doorAttempts) * 100) : 0;

  const supportersIdd = supportersRes.count ?? 0;
  const vbmReturned = vbmRes.count ?? 0;

  // Raw rows handed to the chart — it buckets per selected range client-side.
  const contactPoints: ContactPoint[] = contacts.map((r) => ({
    created_at: r.created_at,
    channel: r.channel,
    result: r.result,
    support: r.support,
  }));

  // ── Canvassers in field ─────────────────────────────────────────────────────
  // door counts per canvasser membership, from the same contact set.
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
      </div>

      <div className="hq-body">
        <ElectionCallout daysLeft={daysLeft} dateLabel={dateLabel} cyclePct={68} campaignId={campaignId} />

        <div className="kpi-row">
          <div className="kpi">
            <Footprints className="kpi-ico" aria-hidden strokeWidth={1.75} />
            <div className="label">Doors knocked · today</div>
            <div className="big">{nf.format(doorsToday)}</div>
            <div className="delta">{nf.format(doorAttempts)} door attempts total</div>
          </div>
          <div className="kpi">
            <MessageSquare className="kpi-ico" aria-hidden strokeWidth={1.75} />
            <div className="label">Contacts made</div>
            <div className="big">
              {nf.format(contactsMade)}
              <span className="unit">/ {contactRate}% of doors</span>
            </div>
            <div className="delta">contact rate</div>
          </div>
          <div className="kpi">
            <ThumbsUp className="kpi-ico" aria-hidden strokeWidth={1.75} />
            <div className="label">Supporters ID&apos;d</div>
            <div className="big">{nf.format(supportersIdd)}<span className="unit">· 4–5 score</span></div>
            <div className="delta">this cycle</div>
          </div>
          <div className="kpi">
            <Mail className="kpi-ico" aria-hidden strokeWidth={1.75} />
            <div className="label">VBM flagged</div>
            <div className="big">{nf.format(vbmReturned)}</div>
            <div className="delta">vote-by-mail voters</div>
          </div>
        </div>

        <div className="hq-grid">
          <KnockVelocity rows={contactPoints} />

          <CandiSuggests />

          <div className="card hq-vbm">
            <div className="card-head">
              <h3>Canvassers in field</h3>
              <span className="sub">· {canvassers.length} {canvassers.length === 1 ? "canvasser" : "canvassers"}</span>
              {canvassers.length > 0 && <span className="dot live canv-live" />}
            </div>
            <div className="card-body flush">
              {canvassers.length === 0 ? (
                <div className="canv-empty muted">
                  No canvassers assigned to this campaign yet.
                </div>
              ) : (
                canvassers.map((c) => (
                  <div className="canv-row" key={c.id}>
                    <div className="avatar">{c.initials}</div>
                    <div className="col canv-id">
                      <b className="canv-name">{c.name}</b>
                      <span className="muted canv-turf">{c.turf}</span>
                    </div>
                    <span className="canv-doors mono">
                      <b>{nf.format(c.doors)}</b> doors
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
