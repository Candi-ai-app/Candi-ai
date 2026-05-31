"use client";

import { useState } from "react";
import { Pencil, ChevronDown, Phone, Send, Sparkles, MoreHorizontal, Trash2 } from "lucide-react";
import { SCRIPT, type Script } from "@/lib/mock-data";

const PREVIEW_PATH = ["intro", "ask_support", "persuadable", "p_housing", "vbm", "thanks"];

export function ScriptsView() {
  const [selNode, setSelNode] = useState("persuadable");
  const node = SCRIPT.nodes[selNode];
  const tabs = ["Edit node", "Preview run", "Analytics"];
  const [tab, setTab] = useState("Edit node");

  return (
    <div className="scr">
      <div className="module-head">
        <div>
          <h1>Scripts</h1>
          <div className="sub">
            <span>{SCRIPT.name}</span> · <span className="mono">13 nodes</span> · <span className="mono">last edited 2h ago</span>
          </div>
        </div>
        <div className="acts">
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost" type="button"><Pencil style={{ width: 13, height: 13 }} /></button>
            <span className="muted" style={{ fontSize: 12 }}>v3.2</span>
            <ChevronDown style={{ width: 12, height: 12, color: "var(--muted)" }} />
          </div>
          <button className="btn" type="button"><Phone style={{ width: 13, height: 13 }} /> Test on phone</button>
          <button className="btn primary" type="button"><Send style={{ width: 13, height: 13 }} /> Publish</button>
        </div>
      </div>

      <div className="scr-body">
        {/* ── Tree canvas ───────────────────────────────────────────── */}
        <div className="scr-canvas">
          <div className="scr-canvas-toolbar">
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost" type="button"><Sparkles style={{ width: 13, height: 13 }} /> Generate with AI</button>
              <span className="muted">·</span>
              <button className="btn ghost" type="button">Auto-layout</button>
            </div>
            <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
              <span className="muted" style={{ fontSize: 11.5 }}>Performance</span>
              <span className="tag accent">62% reach</span>
              <span className="tag indigo">43% persuade</span>
            </div>
          </div>
          <ScriptTree script={SCRIPT} selNode={selNode} onSelect={setSelNode} previewPath={PREVIEW_PATH} />
        </div>

        {/* ── Node editor ───────────────────────────────────────────── */}
        <aside className="scr-side">
          <div className="scr-tabs">
            {tabs.map((t) => (
              <button key={t} className={"scr-tab " + (tab === t ? "active" : "")} type="button" onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          <div className="scr-edit">
            <div className="row" style={{ gap: 6, marginBottom: 10 }}>
              <span className={"tag " + (node.kind === "ask" ? "indigo" : node.kind === "action" ? "amber" : "accent")}>
                {node.kind === "ask" ? "? Ask" : node.kind === "action" ? "⚡ Action" : "💬 Say"}
              </span>
              <span className="muted mono" style={{ fontSize: 11 }}>{selNode}</span>
            </div>

            <div className="lbl-sm">Title</div>
            <input className="scr-input" defaultValue={node.title} key={selNode + "-title"} />

            <div className="lbl-sm">Script text</div>
            <div className="scr-textarea">
              {node.body}
              <div className="scr-vars">
                <span className="scr-var">[VOLUNTEER]</span>
                <span className="scr-var">[VOTER_FIRST]</span>
                <span className="scr-var">[CANDIDATE]</span>
              </div>
            </div>

            <div className="ai-strip" style={{ marginTop: 10 }}>
              <div className="ai-mark">AI</div>
              <span>This branch fires for <b className="mono">22%</b> of doors. Consider splitting <b>Housing</b> by age — under-35 cohort responds 2.1× better to LIHTC framing.</span>
            </div>

            {node.kind === "ask" && node.branches && (
              <>
                <div className="lbl-sm" style={{ marginTop: 14 }}>Branches</div>
                <div className="branch-list">
                  {node.branches.map((b, i) => (
                    <div key={i} className="branch-row">
                      <span className={"branch-dot " + b.tone} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{b.label}</div>
                        <div className="muted mono" style={{ fontSize: 11 }}>→ {b.to}</div>
                      </div>
                      <MoreHorizontal style={{ width: 14, height: 14, color: "var(--muted)" }} />
                    </div>
                  ))}
                  <button className="ai-suggest ghost" style={{ alignSelf: "flex-start", marginTop: 6 }} type="button">+ branch</button>
                </div>
              </>
            )}

            <div className="lbl-sm" style={{ marginTop: 14 }}>Capture data</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="tag indigo">support_score</span>
              <span className="tag indigo">issues[]</span>
              <span className="tag amber">VBM_interest</span>
              <button className="ai-suggest ghost" type="button">+ field</button>
            </div>

            <div className="row" style={{ gap: 6, marginTop: 18 }}>
              <button className="btn ghost" type="button"><Trash2 style={{ width: 13, height: 13 }} /></button>
              <button className="btn" style={{ marginLeft: "auto" }} type="button">Cancel</button>
              <button className="btn primary" type="button">Save node</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Tree rendering ───────────────────────────────────────────────────────────
type Pos = { x: number; y: number; w: number };
const POS: Record<string, Pos> = {
  intro: { x: 80, y: 320, w: 200 },
  ask_support: { x: 340, y: 320, w: 200 },
  strong: { x: 620, y: 100, w: 200 },
  lean: { x: 620, y: 220, w: 200 },
  persuadable: { x: 620, y: 340, w: 200 },
  thanks_out: { x: 620, y: 580, w: 200 },
  p_housing: { x: 880, y: 220, w: 200 },
  p_schools: { x: 880, y: 320, w: 200 },
  p_transit: { x: 880, y: 420, w: 200 },
  p_other: { x: 880, y: 520, w: 200 },
  vbm: { x: 1140, y: 320, w: 200 },
  vbm_form: { x: 1400, y: 240, w: 200 },
  thanks: { x: 1400, y: 400, w: 200 },
};

function ScriptTree({ script, selNode, onSelect, previewPath }: {
  script: Script; selNode: string; onSelect: (id: string) => void; previewPath: string[];
}) {
  const W = 1640, H = 720;

  const links: { from: string; to: string; label: string | null; tone?: string }[] = [];
  for (const [id, n] of Object.entries(script.nodes)) {
    if (!POS[id]) continue;
    if (n.next && POS[n.next]) links.push({ from: id, to: n.next, label: null });
    if (n.branches) {
      for (const b of n.branches) {
        if (POS[b.to]) links.push({ from: id, to: b.to, label: b.label, tone: b.tone });
      }
    }
  }

  const onPath = new Set(previewPath);
  const onPathLinks = new Set<string>();
  for (let i = 0; i < previewPath.length - 1; i++) onPathLinks.add(previewPath[i] + "→" + previewPath[i + 1]);

  return (
    <div className="scr-tree-wrap">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="scr-tree">
        <defs>
          <pattern id="treegrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="0.8" fill="var(--mute-3)" />
          </pattern>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--mute-2)" />
          </marker>
          <marker id="arr-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--accent-ink)" />
          </marker>
        </defs>
        <rect width={W} height={H} fill="url(#treegrid)" />

        {links.map((l, i) => {
          const a = POS[l.from], b = POS[l.to];
          const x1 = a.x + a.w, y1 = a.y + 32;
          const x2 = b.x, y2 = b.y + 32;
          const mx = (x1 + x2) / 2;
          const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
          const isOn = onPathLinks.has(l.from + "→" + l.to);
          return (
            <g key={i}>
              <path d={path} fill="none" stroke={isOn ? "var(--accent-ink)" : "var(--border-2)"} strokeWidth={isOn ? 2 : 1.2} markerEnd={isOn ? "url(#arr-on)" : "url(#arr)"} />
              {l.label && (
                <g>
                  <rect x={mx - 50} y={(y1 + y2) / 2 - 9} width="100" height="18" rx="9" fill="var(--surface)" stroke={isOn ? "var(--accent-ink)" : "var(--border)"} />
                  <text x={mx} y={(y1 + y2) / 2 + 3.5} fontSize="10" textAnchor="middle" fontFamily="var(--f-sans)" fill="var(--ink-2)">{l.label}</text>
                </g>
              )}
            </g>
          );
        })}

        {Object.entries(script.nodes).map(([id, n]) => {
          const p = POS[id];
          if (!p) return null;
          const sel = id === selNode;
          const onp = onPath.has(id);
          return (
            <g key={id} transform={`translate(${p.x}, ${p.y})`} onClick={() => onSelect(id)} style={{ cursor: "pointer" }}>
              <rect
                x="0" y="0" width={p.w} height="64" rx="10"
                fill={onp ? "color-mix(in oklch, var(--accent) 12%, var(--surface))" : "var(--surface)"}
                stroke={sel ? "var(--ink)" : onp ? "var(--accent-ink)" : "var(--border)"}
                strokeWidth={sel ? 2 : 1}
                style={{ filter: sel ? "drop-shadow(0 8px 18px rgba(20,24,31,0.16))" : "drop-shadow(0 1px 0 oklch(0.93 0.004 90))" }}
              />
              <rect x="0" y="0" width="4" height="64" fill={n.kind === "ask" ? "var(--indigo)" : n.kind === "action" ? "var(--amber)" : "var(--accent)"} />
              <text x="14" y="22" fontSize="9.5" fontFamily="var(--f-mono)" letterSpacing="0.06em" fill="var(--muted)">
                {(n.kind === "ask" ? "ASK" : n.kind === "action" ? "ACTION" : "SAY") + "  ·  " + id}
              </text>
              <text x="14" y="40" fontSize="12.5" fontFamily="var(--f-sans)" fontWeight="600" fill="var(--ink)">{n.title}</text>
              <text x="14" y="55" fontSize="10.5" fontFamily="var(--f-sans)" fill="var(--muted)">
                {(n.body || "").slice(0, 38) + (n.body && n.body.length > 38 ? "…" : "")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
