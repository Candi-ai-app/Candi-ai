"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Sparkles, Plus, Search, SlidersHorizontal, X, MapPinned, Users, DoorOpen, Route, FileText, Activity } from "lucide-react";
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
          <button
            className="btn"
            type="button"
            disabled
            title="Soon — Candi will auto-cut balanced turfs from your filtered voters"
          >
            <Sparkles className="ico" /> AI cut turfs <span className="turf-soon">Soon</span>
          </button>
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
              <span className="turf-empty-ico"><MapPinned style={{ width: 20, height: 20 }} /></span>
              <b>No turfs yet</b>
              <span className="muted">
                Filter the voters you want on the map, then use the polygon tool to cut and save your first turf.
              </span>
            </div>
          ) : (
            STATUS_GROUPS.map((g) => {
              const rows = visible.filter((t) => t.status === g.key);
              if (rows.length === 0) return null;
              return (
                <div className="turf-section" key={g.key}>
                  <div className="turf-section-h">
                    <span className={g.dot} /> {g.label} <span className="turf-section-n mono">{rows.length}</span>
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
      <div className="turf-card-top">
        <span className="turf-card-name">{t.name}</span>
        <StatusBadge status={t.status} />
      </div>
      <div className="turf-card-meta">
        <span className="turf-card-stat"><DoorOpen className="turf-mi" /> <span className="mono">{t.doorCount.toLocaleString()}</span> doors</span>
        <span className="turf-card-stat"><Users className="turf-mi" /> <span className="mono">{t.voterCount.toLocaleString()}</span> voters</span>
      </div>
      <div className="turf-card-foot">
        <span className="turf-card-assignee">{t.assignee ?? "Unassigned"}</span>
        {t.hasBoundary && <span className="tag mono turf-card-maptag"><MapPinned className="turf-mi" /> map</span>}
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
        <div className="turf-tiles">
          <div className="turf-tile">
            <DoorOpen className="turf-tile-ico" />
            <div className="serif turf-tile-n">{t.doorCount.toLocaleString()}</div>
            <div className="turf-tile-l">Doors</div>
          </div>
          <div className="turf-tile">
            <Users className="turf-tile-ico" />
            <div className="serif turf-tile-n">{t.voterCount.toLocaleString()}</div>
            <div className="turf-tile-l">Voters</div>
          </div>
          <div className="turf-tile">
            <span className="turf-tile-pill"><StatusBadge status={t.status} complete="complete" /></span>
            <div className="turf-tile-l">Status</div>
          </div>
        </div>

        <div className="turf-detail-section">
          <div className="turf-detail-h">Assignment</div>
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
              {t.hasBoundary
                ? <span className="row" style={{ gap: 5 }}><MapPinned style={{ width: 13, height: 13, color: "var(--muted)" }} /> Drawn on map</span>
                : <span className="muted">Not drawn yet</span>}
            </div>
          </div>
        </div>

        {/* Fields we don't yet store per-turf — clearly labelled "not yet available",
            never fabricated. Shown as muted rows so the drawer doesn't read half-empty. */}
        <div className="turf-detail-section">
          <div className="turf-detail-h">Planning</div>
          <div className="turf-soon-row">
            <Route className="turf-soon-ico" />
            <span className="turf-soon-label">Optimized route</span>
            <span className="turf-soon-tag">Not yet available</span>
          </div>
          <div className="turf-soon-row">
            <FileText className="turf-soon-ico" />
            <span className="turf-soon-label">Canvassing script</span>
            <span className="turf-soon-tag">Not yet assigned</span>
          </div>
        </div>

        <div className="turf-detail-section">
          <div className="turf-detail-h">Doors · today</div>
          <div className="turf-soon-row">
            <Activity className="turf-soon-ico" />
            <span className="turf-soon-label">Per-door activity</span>
            <span className="turf-soon-tag">Not tracked yet</span>
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
