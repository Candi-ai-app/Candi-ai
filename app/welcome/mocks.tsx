/* Candi app-UI mocks for the landing page (/welcome) — ported from the design's
   mocks.js. Returns React nodes for the hero card + tabbed product peek screens.
   Class names are unprefixed here; they resolve under the page's `.lp` root in
   landing.css (e.g. .lp .lp-app, .lp .vtable). */
import type { ReactNode } from "react";

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

const NAV: { id: ScreenName; label: string }[] = [
  { id: "voters", label: "Voters" },
  { id: "turf", label: "Turf" },
  { id: "scripts", label: "Scripts" },
  { id: "texting", label: "Texting" },
  { id: "hq", label: "HQ" },
];

function Sidebar({ active }: { active: ScreenName }) {
  return (
    <div className="side">
      <div className="b">
        <span className="m">{PIN}</span> Candi<span className="dot">.</span>
      </div>
      <div className="lbl">Campaign OS</div>
      {NAV.map((n) => (
        <div key={n.id} className={`nv ${n.id === active ? "on" : ""}`}>
          <span className="i" /> {n.label}
        </div>
      ))}
    </div>
  );
}

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
        <span className="t">Turf</span>
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
  // The source design's tabbed peek does not include a Scripts screen; provide a
  // faithful in-style script view so the module/sidebar set stays consistent.
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

function HqScreen() {
  const stats: [string, string][] = [
    ["1,940", "Doors knocked today"],
    ["31%", "Text reply rate"],
    ["+4.2pt", "Modeled turnout lift"],
    ["86", "Active volunteers"],
  ];
  const bars = [38, 52, 47, 63, 71, 80, 92];
  return (
    <>
      <div className="top">
        <span className="t">HQ</span>
        <span className="pill">Live · updated 2m ago</span>
      </div>
      <div className="body" style={{ display: "flex", gap: 14 }}>
        <div className="mini-stat" style={{ flex: "0 0 250px", padding: 0, gridTemplateColumns: "1fr 1fr" }}>
          {stats.map(([b, s]) => (
            <div key={s} className="s">
              <b>{b}</b>
              <span>{s}</span>
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
          }}
        >
          <div
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
            }}
          >
            Doors / day · this week
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 7, marginTop: 12, minHeight: 120 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, background: "var(--accent)", borderRadius: "3px 3px 0 0", height: `${h}%` }} />
            ))}
          </div>
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
