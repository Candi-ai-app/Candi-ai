"use client";

import { useMemo, useState } from "react";
import { Layers, Sparkles, Plus, Search, SlidersHorizontal, MapPin, X } from "lucide-react";
import { TURFS, CANVASSERS, type Turf, type Canvasser } from "@/lib/mock-data";
import type { VoterPoint } from "@/app/(app)/canvassing/actions";
import dynamic from "next/dynamic";

// Mapbox GL touches window/WebGL — load it client-only.
const TurfMap = dynamic(() => import("@/components/canvassing/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => (
    <div className="map-wrap" style={{ display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>
      Loading map…
    </div>
  ),
});

export function TurfView({ voterPoints = [] }: { voterPoints?: VoterPoint[] }) {
  const [selTurf, setSelTurf] = useState<string | null>("T-12S-A");
  const sel = useMemo(() => TURFS.find((t) => t.id === selTurf) ?? null, [selTurf]);
  const livePins = CANVASSERS.filter((c) => c.status === "live");
  const knockedToday = TURFS.reduce((a, t) => a + t.knocked, 0);

  return (
    <div className="turf">
      <div className="module-head">
        <div>
          <h1>Canvassing</h1>
          <div className="sub">
            <span className="mono">8</span> active turfs · <span className="mono">{livePins.length}</span> canvassers in field ·&nbsp;
            <span className="mono">{knockedToday.toLocaleString()}</span> doors knocked today
          </div>
        </div>
        <div className="acts">
          <button className="btn" type="button"><Layers className="ico" /> Layers</button>
          <button className="btn" type="button"><Sparkles className="ico" /> AI cut turfs</button>
          <button className="btn primary" type="button"><Plus className="ico" /> New turf</button>
        </div>
      </div>

      <div className="turf-body">
        {/* ── Turf list ─────────────────────────────────────────────── */}
        <aside className="turf-list">
          <div className="vot-toolbar" style={{ padding: "10px 14px" }}>
            <div className="row" style={{ gap: 6, flex: 1 }}>
              <Search style={{ width: 13, height: 13, color: "var(--muted)" }} />
              <span className="muted" style={{ fontSize: 12 }}>Filter turfs</span>
            </div>
            <button className="btn ghost" type="button"><SlidersHorizontal style={{ width: 13, height: 13 }} /></button>
          </div>

          {([
            { key: "active", label: "Active", dot: "dot live" },
            { key: "complete", label: "Complete", dot: "dot ok" },
            { key: "queued", label: "Queued", dot: "dot" },
          ] as const).map((g) => {
            const rows = TURFS.filter((t) => t.status === g.key);
            return (
              <div className="turf-section" key={g.key}>
                <div className="turf-section-h">
                  <span className={g.dot} /> {g.label} <span className="muted mono">{rows.length}</span>
                </div>
                {rows.map((t) => (
                  <TurfRow key={t.id} t={t} active={t.id === selTurf} onSelect={() => setSelTurf(t.id)} />
                ))}
              </div>
            );
          })}
        </aside>

        {/* ── Map — real Mapbox turf cutting + filtered voter pins ──── */}
        <TurfMap voterPoints={voterPoints} />

        {/* ── Turf detail ───────────────────────────────────────────── */}
        {sel && <TurfDetail t={sel} onClose={() => setSelTurf(null)} />}
      </div>
    </div>
  );
}

function TurfRow({ t, active, onSelect }: { t: Turf; active: boolean; onSelect: () => void }) {
  const pct = t.doors ? Math.round((t.knocked / t.doors) * 100) : 0;
  return (
    <button className={"turf-card" + (active ? " active" : "")} type="button" onClick={onSelect}>
      <div className="row" style={{ gap: 6 }}>
        <span className="tag mono">{t.id}</span>
        {t.status === "active" && <span className="tag accent">live</span>}
        {t.status === "complete" && <span className="tag teal">done</span>}
        {t.status === "queued" && <span className="tag">queued</span>}
      </div>
      <div style={{ fontWeight: 500, fontSize: 13, marginTop: 4 }}>{t.name}</div>
      <div className="row muted" style={{ fontSize: 11.5, marginTop: 2, gap: 6 }}>
        <span className="mono">{t.knocked}/{t.doors}</span> doors · {t.assignee}
      </div>
      <div className="bar accent" style={{ marginTop: 8 }}><i style={{ width: `${pct}%`, background: t.color }} /></div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{pct}%</span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{t.eta}</span>
      </div>
    </button>
  );
}

const DOORS_TODAY = [
  { addr: "5031 Penn Ave", v: "Kenji Park", res: "Strong support", tone: "good" },
  { addr: "5128 Bigelow Blvd", v: "Lucia Ferrari", res: "Persuadable · housing", tone: "good" },
  { addr: "5500 Walnut St #312", v: "Priya Raman", res: "In progress", tone: "neutral" },
  { addr: "5621 Hobart St", v: "Imani Bell", res: "Volunteer signup", tone: "good" },
  { addr: "5847 Forbes Ave", v: "Naomi Eisner", res: "Not home (2nd)", tone: "miss" },
  { addr: "639 N Negley Ave", v: "Yuki Tanaka", res: "Strong support", tone: "good" },
];

function TurfDetail({ t, onClose }: { t: Turf; onClose: () => void }) {
  const pct = t.doors ? Math.round((t.knocked / t.doors) * 100) : 0;
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div>
          <div className="row" style={{ gap: 6 }}>
            <span className="tag mono">{t.id}</span>
            {t.status === "active" && <span className="tag accent">live</span>}
            {t.status === "complete" && <span className="tag teal">complete</span>}
            {t.status === "queued" && <span className="tag">queued</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{t.name}</div>
        </div>
        <X className="x" style={{ width: 16, height: 16 }} onClick={onClose} />
      </div>
      <div className="drawer-body">
        <div className="kpi-mini-row">
          <div className="kpi-mini"><div className="serif" style={{ fontSize: 24 }}>{t.doors}</div><div className="muted" style={{ fontSize: 11 }}>Doors</div></div>
          <div className="kpi-mini"><div className="serif" style={{ fontSize: 24 }}>{t.knocked}</div><div className="muted" style={{ fontSize: 11 }}>Knocked</div></div>
          <div className="kpi-mini"><div className="serif" style={{ fontSize: 24 }}>{t.contacts}</div><div className="muted" style={{ fontSize: 11 }}>Contacts</div></div>
          <div className="kpi-mini"><div className="serif" style={{ fontSize: 24 }}>{Math.round(t.support * 100)}%</div><div className="muted" style={{ fontSize: 11 }}>Support</div></div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
            <span className="muted">Completion</span>
            <span className="mono">{pct}%</span>
          </div>
          <div className="bar"><i style={{ width: `${pct}%`, background: t.color }} /></div>
        </div>

        <div className="ai-strip" style={{ marginTop: 14 }}>
          <div className="ai-mark">AI</div>
          <span>Optimized order saves <b>~28 min</b> vs door-number order. <span style={{ textDecoration: "underline", cursor: "pointer" }}>View route</span></span>
        </div>

        <div className="field-row"><div className="lbl">Assignee</div><div className="val row" style={{ gap: 6 }}>
          <div className="avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{t.assignee.split(" ").map((s) => s[0]).join("")}</div>
          <span>{t.assignee}</span>
          <button className="ai-suggest ghost" style={{ marginLeft: "auto" }} type="button">Reassign</button>
        </div></div>
        <div className="field-row"><div className="lbl">Boundary</div><div className="val">Centre Ave + N Craig St + 5th Ave + Bayard St</div></div>
        <div className="field-row"><div className="lbl">Created</div><div className="val muted">May 14 · auto-cut by Candi</div></div>
        <div className="field-row"><div className="lbl">Script</div><div className="val"><span className="tag indigo">Standard Canvass · v3.2</span></div></div>
        <div className="field-row"><div className="lbl">ETA</div><div className="val mono">{t.eta}</div></div>

        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, marginBottom: 8 }}>Doors · today</div>
          <div className="door-list">
            {DOORS_TODAY.map((d, i) => (
              <div key={i} className="door-row">
                <span className="tl-dot" data-tone={d.tone} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{d.addr}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{d.v} · {d.res}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Map canvas — abstract SVG city (placeholder until Mapbox token lands) ─────
const MAP_TURFS = [
  { id: "T-07N-A", x: 80, y: 100, poly: "M 80,100 L 320,100 L 320,250 L 80,250 Z", color: "oklch(0.86 0.2 125)", label: "07N · Centre / Craig", queued: false },
  { id: "T-07N-B", x: 340, y: 100, poly: "M 340,100 L 580,100 L 580,250 L 340,250 Z", color: "oklch(0.7 0.1 195)", label: "07N · Atwood", queued: false },
  { id: "T-03W-A", x: 600, y: 100, poly: "M 600,100 L 840,100 L 840,250 L 600,250 Z", color: "oklch(0.78 0.14 75)", label: "03W · Murray", queued: false },
  { id: "T-14E-A", x: 860, y: 100, poly: "M 860,100 L 1040,100 L 1040,250 L 860,250 Z", color: "oklch(0.64 0.18 18)", label: "14E · Penn", queued: false },
  { id: "T-12S-A", x: 80, y: 270, poly: "M 80,270 L 380,270 L 380,420 L 80,420 Z", color: "oklch(0.5 0.16 265)", label: "12S · E Carson E", queued: false },
  { id: "T-03W-B", x: 400, y: 270, poly: "M 400,270 L 660,270 L 660,420 L 400,420 Z", color: "oklch(0.7 0.1 195)", label: "03W · Forbes", queued: false },
  { id: "T-14E-B", x: 680, y: 270, poly: "M 680,270 L 900,270 L 900,420 L 680,420 Z", color: "oklch(0.65 0.01 250)", label: "14E · N Craig", queued: true },
  { id: "T-12S-B", x: 920, y: 270, poly: "M 920,270 L 1040,270 L 1040,420 L 920,420 Z", color: "oklch(0.65 0.01 250)", label: "12S · Sarah", queued: true },
];

const ARTERIALS: [string, string][] = [
  ["M 60 80 L 1050 80", "Centre Ave"],
  ["M 60 200 L 1050 200", "5th Ave"],
  ["M 60 320 L 1050 320", "Forbes Ave"],
  ["M 60 440 L 1050 440", "Penn Ave"],
];
const CROSS = [180, 340, 500, 660, 820, 960];
const ROUTE_PINS: [number, number, number][] = [[100, 300, 1], [130, 340, 2], [160, 300, 3], [200, 360, 4], [250, 320, 5], [300, 400, 6], [350, 400, 7]];
const PIN_POS: Record<number, [number, number]> = { 1: [180, 180], 3: [220, 350], 4: [720, 180] };

function MapCanvas({ selTurf, onPick, livePins }: { selTurf: string | null; onPick: (id: string) => void; livePins: Canvasser[] }) {
  const W = 1100, H = 720;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="0.7" fill="var(--mute-3)" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="oklch(0.97 0.005 90)" />
      <rect width={W} height={H} fill="url(#dots)" />

      {/* River */}
      <path d="M -20 540 Q 200 480, 380 540 T 760 560 T 1120 520 L 1120 740 L -20 740 Z" fill="oklch(0.93 0.025 240)" stroke="oklch(0.85 0.03 240)" strokeWidth="1" />
      <text x="200" y="640" fontSize="13" fill="oklch(0.55 0.05 240)" fontFamily="var(--f-sans)" fontStyle="italic">Allegheny River</text>

      {/* Arterials */}
      {ARTERIALS.map(([d, name], i) => (
        <g key={i}>
          <path d={d} stroke="var(--mute-3)" strokeWidth="6" strokeLinecap="round" />
          <path d={d} stroke="var(--surface)" strokeWidth="3" strokeLinecap="round" />
          <text x="80" y={80 + i * 120 - 8} fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">{name}</text>
        </g>
      ))}
      {/* Cross streets */}
      {CROSS.map((x, i) => (
        <g key={i}>
          <path d={`M ${x} 40 L ${x} 510`} stroke="var(--mute-3)" strokeWidth="5" strokeLinecap="round" />
          <path d={`M ${x} 40 L ${x} 510`} stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}

      {/* Turf polygons */}
      {MAP_TURFS.map((t) => {
        const isSel = t.id === selTurf;
        return (
          <g key={t.id} onClick={() => onPick(t.id)} style={{ cursor: "pointer" }}>
            <path d={t.poly} fill={t.color} fillOpacity={isSel ? 0.55 : t.queued ? 0.12 : 0.32} stroke={t.color} strokeWidth={isSel ? 2.5 : 1.5} strokeDasharray={t.queued ? "6 4" : undefined} />
            <text x={t.x + 10} y={t.y + 22} fontSize="11" fontFamily="var(--f-mono)" fontWeight="600" fill="oklch(0.22 0.06 130)">{t.id}</text>
            <text x={t.x + 10} y={t.y + 36} fontSize="10" fontFamily="var(--f-sans)" fill="oklch(0.32 0.04 130)">{t.label}</text>
          </g>
        );
      })}

      {/* AI-suggested route inside selected turf */}
      {selTurf === "T-12S-A" && (
        <g>
          <path d="M 100,300 L 130,300 L 130,340 L 160,340 L 160,300 L 200,300 L 200,360 L 250,360 L 250,320 L 300,320 L 300,400 L 350,400" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" />
          {ROUTE_PINS.map(([x, y, n]) => (
            <g key={n}>
              <circle cx={x} cy={y} r="9" fill="var(--surface)" stroke="var(--accent-ink)" strokeWidth="1.5" />
              <text x={x} y={y + 3} fontSize="9" textAnchor="middle" fontFamily="var(--f-mono)" fontWeight="600" fill="var(--ink)">{n}</text>
            </g>
          ))}
        </g>
      )}

      {/* Live canvasser pins */}
      {livePins.map((c) => {
        const pos = PIN_POS[c.id] ?? [500, 200];
        return (
          <g key={c.id} transform={`translate(${pos[0]}, ${pos[1]})`}>
            <circle r="14" fill="var(--ink)" />
            <text y="4" fontSize="10" textAnchor="middle" fontFamily="var(--f-mono)" fontWeight="600" fill="var(--accent)">{c.initials}</text>
            <circle r="20" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.6">
              <animate attributeName="r" from="14" to="26" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.6" to="0" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
