import { redirect } from "next/navigation";
import { Filter, Calendar, Sparkles } from "lucide-react";
import { getRole, isAdminRole } from "@/lib/auth";

// ── placeholder data (wired to Supabase in the Voters/HQ slice) ──────────────
const velocity = [30, 38, 34, 46, 42, 52, 58, 50, 64, 60, 72, 66, 80, 86];

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

const canvassers = [
  { name: "Diego Reyes", initials: "DR", turf: "Turf 2 · Precinct 12S", doors: 84, batt: 72 },
  { name: "Aisha Bell", initials: "AB", turf: "Turf 1 · Precinct 07N", doors: 61, batt: 45 },
  { name: "Marcus Howe", initials: "MH", turf: "Turf 4 · Precinct 19E", doors: 52, batt: 88 },
];

// chart geometry
const CW = 620;
const CH = 150;
const PAD = 12;
const step = (CW - PAD * 2) / (velocity.length - 1);
const pts = velocity.map((v, i) => [PAD + i * step, CH - (v / 100) * (CH - 24)]);
const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
const area = `${line} L${(PAD + (velocity.length - 1) * step).toFixed(1)},${CH} L${PAD},${CH} Z`;

export default async function HQPage() {
  // HQ is the campaign command center — owners/directors only.
  if (!isAdminRole(await getRole())) redirect("/canvassing");

  return (
    <div className="hq">
      <div className="module-head">
        <h1>HQ Dashboard</h1>
        <div className="sub">Saturday · May 16 · 4:47 PM EDT · 171 days to election</div>
        <div className="acts">
          <button className="btn" type="button"><Filter className="ico" /> Filter</button>
          <button className="btn" type="button"><Calendar className="ico" /> Today</button>
          <button className="btn accent" type="button"><Sparkles className="ico" /> Ask Candi</button>
        </div>
      </div>

      <div className="hq-body">
        <div className="kpi-row">
          <div className="kpi dark">
            <div className="label">Days to election</div>
            <div className="big">171<span className="unit">· Nov 3</span></div>
            <div className="bar accent" style={{ marginTop: 6 }}><i style={{ width: "68%" }} /></div>
            <div className="delta">cycle 68%</div>
          </div>
          <div className="kpi">
            <div className="label">Doors knocked · today</div>
            <div className="big">500<span className="unit">/ 1,800</span></div>
            <div className="delta up">↑ +18% vs. yesterday</div>
          </div>
          <div className="kpi">
            <div className="label">Contacts made</div>
            <div className="big">365<span className="unit">/ 73% of doors</span></div>
            <div className="delta up">↑ +6 pt contact rate</div>
          </div>
          <div className="kpi">
            <div className="label">Supporters ID&apos;d</div>
            <div className="big">1,204<span className="unit">· 3/5 avg</span></div>
            <div className="delta">this cycle</div>
          </div>
          <div className="kpi">
            <div className="label">VBM returned</div>
            <div className="big">1,247<span className="unit">/ 4,902</span></div>
            <div className="delta">25% returned</div>
          </div>
        </div>

        <div className="hq-grid">
          <div className="card hq-trend">
            <div className="card-head">
              <h3>Knock velocity</h3>
              <span className="sub">· last 14 days</span>
              <div className="acts">
                <span className="tag accent">Doors</span>
                <span className="tag indigo">Contacts</span>
                <span className="tag">Support</span>
              </div>
            </div>
            <div className="card-body">
              <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: "100%", height: 200, display: "block" }}>
                {velocity.map((v, i) => {
                  const h = (v / 100) * (CH - 24);
                  return (
                    <rect
                      key={i}
                      x={PAD + i * step - 5}
                      y={CH - h}
                      width={10}
                      height={h}
                      rx={2}
                      fill="var(--ink)"
                      opacity={0.85}
                    />
                  );
                })}
                <path d={area} fill="var(--accent)" opacity={0.18} />
                <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} />
              </svg>
            </div>
          </div>

          <div className="card ai">
            <div className="card-head">
              <span className="ai-mark">AI</span>
              <h3>Candi suggests</h3>
              <span className="sub">· {suggestions.length} actions</span>
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
              <span className="sub">· 3 live</span>
              <span className="dot live" style={{ marginLeft: 2 }} />
            </div>
            <div className="card-body flush">
              {canvassers.map((c) => (
                <div className="canv-row" key={c.name}>
                  <div className="avatar">{c.initials}</div>
                  <div className="col" style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 12.5 }}>{c.name}</b>
                    <span className="muted" style={{ fontSize: 11.5 }}>{c.turf}</span>
                  </div>
                  <div className="batt" data-low={c.batt < 50}>
                    <div className="batt-shell"><i style={{ width: `${c.batt}%` }} /></div>
                    <span className="mono">{c.batt}%</span>
                  </div>
                  <span className="mono" style={{ width: 56, textAlign: "right", color: "var(--ink-2)" }}>
                    {c.doors} doors
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
