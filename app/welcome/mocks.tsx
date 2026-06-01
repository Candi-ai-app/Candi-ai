/* Candi app-UI mocks for the landing page (/welcome). Returns React nodes for the
   hero device card + tabbed product-peek screens. The HQ screen is a faithful,
   simplified render of the *real* dashboard (app/(app)/page.tsx): same sidebar nav,
   the same four KPIs + lucide icons, the Knock-velocity chart, Candi-suggests
   confidence rings, and Canvassers-in-field. Other screens stay representative.

   HQ-specific class names are prefixed `hqm-` so they can't pick up the app's
   global `.kpi`/`.card`/`.insight`/`.conf-ring` rules from globals.css; the rest
   resolve under the page's `.lp` root in landing.css. */
import type { CSSProperties, ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Map as MapIcon,
  GitBranch,
  MessageSquare,
  Footprints,
  ThumbsUp,
  Mail,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

export type ScreenName = "voters" | "turf" | "scripts" | "texting" | "hq";

export const PIN: ReactNode = (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M24 7 C15.7 7 10 13 10 20.4 C10 30.6 24 42 24 42 C24 42 38 30.6 38 20.4 C38 13 32.3 7 24 7 Z"
      stroke="currentColor"
      strokeWidth="3.6"
      strokeLinejoin="round"
    />
    <rect x="17" y="14" width="14" height="13" rx="3.4" stroke="currentColor" strokeWidth="3" />
    <circle cx="24" cy="20.5" r="2.4" fill="currentColor" />
  </svg>
);

// Mirrors lib/nav.ts PRIMARY_NAV (label + icon), mapped to the mock screen ids.
const NAV: { id: ScreenName; label: string; Icon: LucideIcon }[] = [
  { id: "hq", label: "HQ Dashboard", Icon: LayoutDashboard },
  { id: "voters", label: "Voters", Icon: Users },
  { id: "turf", label: "Canvassing", Icon: MapIcon },
  { id: "scripts", label: "Scripts", Icon: GitBranch },
  { id: "texting", label: "Texting", Icon: MessageSquare },
];

function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "··";
}

function Sidebar({ active }: { active: ScreenName }) {
  return (
    <div className="side">
      <div className="brandrow">
        <span className="bmk">C</span>
        <span className="bname">
          Candi <small>v1·MVP</small>
        </span>
      </div>
      <div className="switch">
        <span className="switch-av">DR</span>
        <div className="switch-info">
          <span className="switch-lbl">Campaign</span>
          <b>Dana Reyes</b>
        </div>
        <span className="switch-link">Switch</span>
      </div>
      <div className="sec-lbl">Campaign OS</div>
      <nav className="nav2">
        {NAV.map(({ id, label, Icon }) => (
          <div key={id} className={`nv ${id === active ? "on" : ""}`}>
            <Icon className="nv-ico" strokeWidth={1.9} aria-hidden /> <span>{label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}

// ── HQ — faithful simplified render of the real dashboard ──────────────────────

const SUGGEST: { c: number; title: string; tags: string[] }[] = [
  { c: 86, title: "Re-canvass Precinct 12S tomorrow AM", tags: ["Turf", "Modeling"] },
  { c: 79, title: "Move 220 renters to the renter-relief script", tags: ["Script", "Persuasion"] },
];

const CANV: { name: string; turf: string; doors: string }[] = [
  { name: "Diego Reyes", turf: "Oak Hill · active", doors: "312" },
  { name: "Aisha Batra", turf: "Riverside · active", doors: "268" },
  { name: "Tom Whitfield", turf: "Midtown", doors: "154" },
];

/** Compact line+area+bars sparkline matching the real Knock-velocity chart. */
function MiniTrend() {
  const data = [180, 240, 210, 300, 280, 360, 410, 350, 470, 520, 460, 600, 560, 712];
  const W = 300;
  const H = 92;
  const PAD = 6;
  const TOP = 8;
  const BOT = 4;
  const PLOT = H - TOP - BOT;
  const max = Math.max(...data);
  const n = data.length;
  const step = (W - PAD * 2) / (n - 1);
  const x = (i: number) => PAD + i * step;
  const y = (v: number) => TOP + PLOT - (v / max) * PLOT;
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${TOP + PLOT} L${x(0).toFixed(1)},${TOP + PLOT} Z`;
  const bw = Math.max(3, step * 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hqm-svg" preserveAspectRatio="none" aria-hidden>
      <line x1={PAD} y1={TOP + PLOT} x2={W - PAD} y2={TOP + PLOT} stroke="var(--hairline)" strokeWidth={1} />
      {data.map((v, i) => {
        const h = (v / max) * PLOT;
        return (
          <rect
            key={i}
            x={x(i) - bw / 2}
            y={TOP + PLOT - h}
            width={bw}
            height={Math.max(h, 0.5)}
            rx={2}
            fill="var(--accent)"
            opacity={0.18}
          />
        );
      })}
      <path d={area} fill="var(--accent)" opacity={0.12} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function HqScreen() {
  return (
    <div className="hqm">
      <div className="hqm-head">
        <div>
          <div className="hqm-h1">HQ Dashboard</div>
          <div className="hqm-sub">Dana Reyes · City Council · 171 days to election</div>
        </div>
        <span className="hqm-live">
          <span className="hqm-dot" /> Live · updated 2m ago
        </span>
      </div>

      <div className="hqm-callout">
        <div className="hqm-ec-count">
          <div className="hqm-ec-days">
            171<span>days to Election Day · Nov 3</span>
          </div>
          <div className="hqm-ec-bar">
            <i style={{ width: "68%" }} />
          </div>
        </div>
        <div className="hqm-ec-focus">
          <span className="hqm-ec-flabel">This week&apos;s focus</span>
          Lock down Precinct 12 turnout — 3 GOTV shifts left.
        </div>
      </div>

      <div className="hqm-kpis">
        <div className="hqm-kpi">
          <Footprints className="hqm-kpi-ico" strokeWidth={1.75} aria-hidden />
          <div className="hqm-kpi-label">Doors knocked · today</div>
          <div className="hqm-kpi-big">1,940</div>
          <div className="hqm-kpi-delta">8,412 attempts total</div>
        </div>
        <div className="hqm-kpi">
          <MessageSquare className="hqm-kpi-ico" strokeWidth={1.75} aria-hidden />
          <div className="hqm-kpi-label">Contacts made</div>
          <div className="hqm-kpi-big">
            5,120<span className="hqm-kpi-unit">/ 61% of doors</span>
          </div>
          <div className="hqm-kpi-delta">contact rate</div>
        </div>
        <div className="hqm-kpi">
          <ThumbsUp className="hqm-kpi-ico" strokeWidth={1.75} aria-hidden />
          <div className="hqm-kpi-big-wrap">
            <div className="hqm-kpi-label">Supporters ID&apos;d</div>
            <div className="hqm-kpi-big">
              2,308<span className="hqm-kpi-unit">· 4–5</span>
            </div>
          </div>
          <div className="hqm-kpi-delta">this cycle</div>
        </div>
        <div className="hqm-kpi">
          <Mail className="hqm-kpi-ico" strokeWidth={1.75} aria-hidden />
          <div className="hqm-kpi-label">VBM flagged</div>
          <div className="hqm-kpi-big">1,204</div>
          <div className="hqm-kpi-delta">vote-by-mail voters</div>
        </div>
      </div>

      <div className="hqm-grid">
        <div className="hqm-card">
          <div className="hqm-ch">
            <b>Knock velocity</b>
            <span className="hqm-csub">· last 14 days</span>
            <div className="hqm-tabs">
              {["Today", "7d", "14d", "30d", "All"].map((t) => (
                <span key={t} className={`hqm-tag ${t === "14d" ? "on" : ""}`}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="hqm-cb">
            <div className="hqm-trend-meta">
              <span>
                <b>6,480</b> doors · last 14 days
              </span>
              <span className="hqm-mono">peak 712/day</span>
            </div>
            <MiniTrend />
            <div className="hqm-series">
              {["Doors", "Contacts", "Support"].map((s) => (
                <span key={s} className={`hqm-tag ${s === "Doors" ? "on" : ""}`}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="hqm-card">
          <div className="hqm-ch">
            <span className="hqm-ai">AI</span>
            <b>Candi suggests</b>
            <span className="hqm-csub">· 3</span>
            <span className="hqm-tag ghost" style={{ marginLeft: "auto" }}>
              Preview
            </span>
          </div>
          <div className="hqm-cb flush">
            {SUGGEST.map((s) => (
              <div className="hqm-insight" key={s.title}>
                <div className="hqm-ring" style={{ ["--c"]: s.c / 100 } as CSSProperties}>
                  <span>{s.c}</span>
                </div>
                <div className="hqm-insight-main">
                  <b>{s.title}</b>
                  <div className="hqm-insight-tags">
                    {s.tags.map((t) => (
                      <span className="hqm-tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <div className="hqm-more">
              View more (1) <ChevronDown className="hqm-chev" strokeWidth={2} aria-hidden />
            </div>
          </div>
        </div>
      </div>

      <div className="hqm-card hqm-canvcard">
        <div className="hqm-ch">
          <b>Canvassers in field</b>
          <span className="hqm-csub">· 3 canvassers</span>
          <span className="hqm-dot" style={{ marginLeft: 6 }} />
        </div>
        <div className="hqm-canv">
          {CANV.map((c) => (
            <div className="hqm-canv-row" key={c.name}>
              <span className="hqm-av">{initials(c.name)}</span>
              <div className="hqm-canv-id">
                <b>{c.name}</b>
                <span>{c.turf}</span>
              </div>
              <span className="hqm-canv-doors">
                <b>{c.doors}</b> doors
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Other product screens (representative) ─────────────────────────────────────

function VotersScreen() {
  const rows: [string, string, number, string][] = [
    ["Maria Alvarez", "Precinct 12", 92, "Persuadable"],
    ["James Okonkwo", "Precinct 12", 78, "GOTV"],
    ["Dolores Kim", "Precinct 09", 64, "Persuadable"],
    ["Frank Russo", "Precinct 14", 41, "Low-turnout"],
    ["Aisha Batra", "Precinct 09", 88, "GOTV"],
    ["Tom Whitfield", "Precinct 14", 55, "Persuadable"],
  ];
  return (
    <>
      <div className="top">
        <span className="t">Voters</span>
        <span className="pill">48,210 in view · 6 shown</span>
      </div>
      <div className="body">
        <table className="vtable">
          <thead>
            <tr>
              <th>Voter</th>
              <th>Precinct</th>
              <th>Support score</th>
              <th>Segment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([n, p, s, t]) => (
              <tr key={n}>
                <td className="nm">{n}</td>
                <td>{p}</td>
                <td>
                  <span className="score">
                    <span className="bar">
                      <i style={{ width: `${s}%` }} />
                    </span>{" "}
                    {s}
                  </span>
                </td>
                <td>
                  <span className="tagx">{t}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TurfScreen() {
  const lists: [string, string, string][] = [
    ["Oak Hill", "320", "1"],
    ["Riverside", "410", "2"],
    ["Midtown", "260", "3"],
  ];
  const gridBg =
    "linear-gradient(var(--hairline) 1px,transparent 1px) 0 0/26px 26px," +
    "linear-gradient(90deg,var(--hairline) 1px,transparent 1px) 0 0/26px 26px,var(--surface)";
  return (
    <>
      <div className="top">
        <span className="t">Canvassing</span>
        <span className="pill">7 walk lists · 1,940 doors</span>
      </div>
      <div className="body" style={{ display: "flex", gap: 14 }}>
        <div
          style={{
            flex: 1,
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            position: "relative",
            background: gridBg,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "14%",
              top: "18%",
              width: "34%",
              height: "40%",
              borderRadius: 10,
              border: "1.5px solid var(--accent-deep)",
              background: "color-mix(in oklch,var(--accent) 22%,transparent)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "54%",
              top: "30%",
              width: "30%",
              height: "46%",
              borderRadius: 10,
              border: "1.5px solid var(--accent-deep)",
              background: "color-mix(in oklch,var(--accent) 14%,transparent)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "24%",
              top: "64%",
              width: "24%",
              height: "24%",
              borderRadius: 10,
              border: "1.5px dashed var(--mute-2)",
            }}
          />
        </div>
        <div style={{ width: 150, flex: "0 0 150px", display: "flex", flexDirection: "column", gap: 8 }}>
          {lists.map(([n, d, w]) => (
            <div
              key={n}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: 10,
                background: "var(--surface)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12 }}>{n}</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                {d} doors · Walk {w}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ScriptsScreen() {
  const lines: [string, string][] = [
    ["intro", "Hi, is this {first_name}? I'm a volunteer with the campaign."],
    ["ask", "Can we count on your vote on November 5th?"],
    ["branch", "If unsure → share the two issues they care most about."],
    ["close", "Thanks! Want a reminder + your polling place the morning of?"],
  ];
  return (
    <>
      <div className="top">
        <span className="t">Scripts</span>
        <span className="pill">Adaptive · 4 steps</span>
      </div>
      <div className="body" style={{ display: "flex", gap: 14 }}>
        <div style={{ width: 150, flex: "0 0 150px", display: "flex", flexDirection: "column", gap: 6 }}>
          {["Canvass — GOTV", "Canvass — Persuasion", "Phone — ID", "Text — Reminder"].map((c, i) => (
            <div
              key={c}
              style={{
                border: `1px solid ${i === 0 ? "var(--accent-deep)" : "var(--hairline)"}`,
                borderRadius: 9,
                padding: "9px 11px",
                background: i === 0 ? "var(--accent-tint)" : "var(--surface)",
                fontSize: 11.5,
                fontWeight: 550,
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--surface)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {lines.map(([k, v]) => (
            <div key={k}>
              <div
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 4,
                }}
              >
                {k}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TextingScreen() {
  const threads: [string, string][] = [
    ["out", "Hi Maria — it's Dana with the Vote Yes on 3 campaign. Can we count on you Nov 5?"],
    ["in", "Yes! Where's my polling place?"],
    ["out", "Riverside Elementary, open 7a–8p. Want a reminder the morning of?"],
    ["in", "That'd be great, thanks 🙏"],
  ];
  return (
    <>
      <div className="top">
        <span className="t">Texting</span>
        <span className="pill">12,400 sent · 31% reply</span>
      </div>
      <div className="body" style={{ display: "flex", gap: 14 }}>
        <div style={{ width: 170, flex: "0 0 170px", display: "flex", flexDirection: "column", gap: 6 }}>
          {["Maria A. · Persuadable", "James O. · GOTV", "Aisha B. · GOTV", "Tom W. · Undecided"].map((c, i) => (
            <div
              key={c}
              style={{
                border: `1px solid ${i === 0 ? "var(--accent-deep)" : "var(--hairline)"}`,
                borderRadius: 9,
                padding: "9px 11px",
                background: i === 0 ? "var(--accent-tint)" : "var(--surface)",
                fontSize: 11.5,
                fontWeight: 550,
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div
          className="mini-chat"
          style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}
        >
          {threads.map(([d, x], i) => (
            <div key={i} className={`bub ${d}`}>
              {x}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const SCREENS: Record<ScreenName, () => ReactNode> = {
  voters: VotersScreen,
  turf: TurfScreen,
  scripts: ScriptsScreen,
  texting: TextingScreen,
  hq: HqScreen,
};

export function AppScreen({ name }: { name: ScreenName }) {
  const Screen = SCREENS[name];
  return (
    <div className="lp-app">
      <Sidebar active={name} />
      <div className="main">
        <Screen />
      </div>
    </div>
  );
}
