"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Sparkles, Plus, Search, SlidersHorizontal, X, MapPinned } from "lucide-react";
import type { VoterPoint, TurfListItem, TurfStats } from "@/app/(app)/canvassing/actions";
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

// Turf status → list grouping + badge styling. Real turfs use queued|active|complete.
const STATUS_GROUPS = [
  { key: "active", label: "Active", dot: "dot live" },
  { key: "complete", label: "Complete", dot: "dot ok" },
  { key: "queued", label: "Queued", dot: "dot" },
] as const;

export function TurfView({
  voterPoints = [],
  turfs = [],
  stats,
}: {
  voterPoints?: VoterPoint[];
  /** Real saved turfs for the active campaign (empty → empty state). */
  turfs?: TurfListItem[];
  /** Real header stats for the active campaign. */
  stats?: TurfStats;
}) {
  const hdr = stats ?? { activeTurfs: 0, totalTurfs: 0, canvassers: 0, doorsToday: 0 };
  // Start with nothing selected so the detail bar stays collapsed and the map is
  // full-width until a turf is clicked (mirrors the Voters pattern).
  const [selId, setSelId] = useState<string | null>(null);
  // Drop a stale selection if the turf it points at disappears as the real set loads.
  useEffect(() => {
    if (selId !== null && !turfs.some((t) => t.id === selId)) setSelId(null);
  }, [turfs, selId]);
  const sel = useMemo(() => turfs.find((t) => t.id === selId) ?? null, [turfs, selId]);

  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? turfs.filter((t) => `${t.name} ${t.assignee ?? ""}`.toLowerCase().includes(q)) : turfs;
  }, [turfs, search]);

  return (
    <div className="turf">
      <div className="module-head">
        <div>
          <h1>Canvassing</h1>
          <div className="sub">
            <span className="mono">{hdr.activeTurfs}</span> active {hdr.activeTurfs === 1 ? "turf" : "turfs"} ·&nbsp;
            <span className="mono">{hdr.canvassers}</span> {hdr.canvassers === 1 ? "canvasser" : "canvassers"} ·&nbsp;
            <span className="mono">{hdr.doorsToday.toLocaleString()}</span> doors knocked today
          </div>
        </div>
        <div className="acts">
          <button className="btn" type="button"><Layers className="ico" /> Layers</button>
          <button className="btn" type="button"><Sparkles className="ico" /> AI cut turfs</button>
          <button className="btn primary" type="button"><Plus className="ico" /> New turf</button>
        </div>
      </div>

      <div className={"turf-body" + (sel ? " detail-open" : "")}>
        {/* ── Turf list ─────────────────────────────────────────────── */}
        <aside className="turf-list">
          <div className="vot-toolbar" style={{ padding: "10px 14px" }}>
            <div className="row" style={{ gap: 6, flex: 1 }}>
              <Search style={{ width: 13, height: 13, color: "var(--muted)" }} />
              <input
                className="turf-filter-input"
                placeholder="Filter turfs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="btn ghost" type="button"><SlidersHorizontal style={{ width: 13, height: 13 }} /></button>
          </div>

          {turfs.length === 0 ? (
            <div className="turf-empty">
              <MapPinned style={{ width: 26, height: 26, color: "var(--muted)" }} />
              <b>No turfs yet</b>
              <span className="muted">
                Draw a turf on the map — filter the voters you want, then use the polygon tool to cut and save it.
              </span>
            </div>
          ) : (
            STATUS_GROUPS.map((g) => {
              const rows = visible.filter((t) => t.status === g.key);
              if (rows.length === 0) return null;
              return (
                <div className="turf-section" key={g.key}>
                  <div className="turf-section-h">
                    <span className={g.dot} /> {g.label} <span className="muted mono">{rows.length}</span>
                  </div>
                  {rows.map((t) => (
                    <TurfRow key={t.id} t={t} active={t.id === selId} onSelect={() => setSelId(t.id)} />
                  ))}
                </div>
              );
            })
          )}
        </aside>

        {/* ── Map — real Mapbox turf cutting + filtered voter pins ──── */}
        <TurfMap voterPoints={voterPoints} />

        {/* ── Turf detail ───────────────────────────────────────────── */}
        {sel && <TurfDetail t={sel} onClose={() => setSelId(null)} />}
      </div>
    </div>
  );
}

function StatusBadge({ status, complete = "done" }: { status: string; complete?: string }) {
  if (status === "active") return <span className="tag accent">live</span>;
  if (status === "complete") return <span className="tag teal">{complete}</span>;
  return <span className="tag">queued</span>;
}

function TurfRow({ t, active, onSelect }: { t: TurfListItem; active: boolean; onSelect: () => void }) {
  return (
    <button className={"turf-card" + (active ? " active" : "")} type="button" onClick={onSelect}>
      <div className="row" style={{ gap: 6 }}>
        <StatusBadge status={t.status} />
        {t.hasBoundary && <span className="tag mono">map</span>}
      </div>
      <div style={{ fontWeight: 500, fontSize: 13, marginTop: 4 }}>{t.name}</div>
      <div className="row muted" style={{ fontSize: 11.5, marginTop: 2, gap: 6 }}>
        <span className="mono">{t.doorCount.toLocaleString()}</span> doors ·{" "}
        <span className="mono">{t.voterCount.toLocaleString()}</span> voters
      </div>
      <div className="row muted" style={{ fontSize: 11.5, marginTop: 2 }}>
        {t.assignee ?? "Unassigned"}
      </div>
    </button>
  );
}

function TurfDetail({ t, onClose }: { t: TurfListItem; onClose: () => void }) {
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div>
          <div className="row" style={{ gap: 6 }}>
            <StatusBadge status={t.status} complete="complete" />
            {t.hasBoundary && <span className="tag mono">on map</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{t.name}</div>
        </div>
        <X className="x" style={{ width: 16, height: 16 }} onClick={onClose} />
      </div>
      <div className="drawer-body">
        <div className="kpi-mini-row">
          <div className="kpi-mini">
            <div className="serif" style={{ fontSize: 24 }}>{t.doorCount.toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 11 }}>Doors</div>
          </div>
          <div className="kpi-mini">
            <div className="serif" style={{ fontSize: 24 }}>{t.voterCount.toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 11 }}>Voters</div>
          </div>
          <div className="kpi-mini">
            <div className="serif" style={{ fontSize: 24, textTransform: "capitalize" }}>{t.status}</div>
            <div className="muted" style={{ fontSize: 11 }}>Status</div>
          </div>
        </div>

        <div className="field-row">
          <div className="lbl">Assignee</div>
          <div className="val row" style={{ gap: 6 }}>
            {t.assignee ? (
              <>
                <div className="avatar" style={{ width: 22, height: 22, fontSize: 10 }}>
                  {initialsOf(t.assignee)}
                </div>
                <span>{t.assignee}</span>
              </>
            ) : (
              <span className="muted">Unassigned</span>
            )}
            <button className="ai-suggest ghost" style={{ marginLeft: "auto" }} type="button">Reassign</button>
          </div>
        </div>

        <div className="field-row">
          <div className="lbl">Boundary</div>
          <div className="val">
            {t.hasBoundary ? "Drawn on map" : <span className="muted">Not drawn yet</span>}
          </div>
        </div>

        {/* Fields we don't yet store per-turf — labelled, not fabricated. */}
        <div className="field-row">
          <div className="lbl">Optimized route</div>
          <div className="val muted">Not yet available</div>
        </div>
        <div className="field-row">
          <div className="lbl">Script</div>
          <div className="val muted">Not yet assigned</div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, marginBottom: 8 }}>
            Doors · today
          </div>
          <div className="muted" style={{ fontSize: 12.5, padding: "4px 0" }}>
            Per-door activity isn&apos;t tracked for this turf yet.
          </div>
        </div>
      </div>
    </aside>
  );
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
