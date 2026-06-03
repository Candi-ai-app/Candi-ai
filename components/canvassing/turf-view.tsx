"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Layers, Sparkles, Plus, Search, SlidersHorizontal, X,
  MapPinned, Users, DoorOpen, Route, FileText, Activity,
  ChevronDown,
} from "lucide-react";
import type { VoterPoint, TurfListItem, TurfStats, CampaignMember } from "@/app/(app)/canvassing/actions";
import { assignTurf, setTurfStatus } from "@/app/(app)/canvassing/actions";
import dynamic from "next/dynamic";
import type { TurfMapControls } from "@/components/canvassing/turf-map";

// Mapbox GL touches window/WebGL — load it client-only.
const TurfMap = dynamic(() => import("@/components/canvassing/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => (
    <div className="map-wrap" style={{ display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>
      Loading map…
    </div>
  ),
});

// Turf status → list grouping + badge styling.
const STATUS_GROUPS = [
  { key: "active", label: "Active", dot: "dot live" },
  { key: "complete", label: "Complete", dot: "dot ok" },
  { key: "queued", label: "Queued", dot: "dot" },
] as const;

const STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" },
] as const;

export function TurfView({
  voterPoints = [],
  turfs = [],
  stats,
  members = [],
}: {
  voterPoints?: VoterPoint[];
  turfs?: TurfListItem[];
  stats?: TurfStats;
  members?: CampaignMember[];
}) {
  const hdr = stats ?? { activeTurfs: 0, totalTurfs: 0, canvassers: 0, doorsToday: 0 };
  const [selId, setSelId] = useState<string | null>(null);

  // Drop stale selection if the turf disappears on re-render.
  useEffect(() => {
    if (selId !== null && !turfs.some((t) => t.id === selId)) setSelId(null);
  }, [turfs, selId]);
  const sel = useMemo(() => turfs.find((t) => t.id === selId) ?? null, [turfs, selId]);

  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? turfs.filter((t) => `${t.name} ${t.assignee ?? ""}`.toLowerCase().includes(q)) : turfs;
  }, [turfs, search]);

  // Handle from TurfMap — lets "New turf" trigger the polygon-draw tool.
  const [mapControls, setMapControls] = useState<TurfMapControls | null>(null);

  // Keep a ref so the dynamic-import callback (which may fire before state is set)
  // can still be stored and called.
  const mapControlsRef = useRef<TurfMapControls | null>(null);
  const handleMapReady = (controls: TurfMapControls) => {
    mapControlsRef.current = controls;
    setMapControls(controls);
  };

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
          {/* Layers button: scrolls to the style switcher inside the map. No separate
              panel needed — the switcher is always accessible on the map itself. */}
          <button
            className="btn"
            type="button"
            title="Switch map style — use the style buttons on the map"
            onClick={() => {
              const sw = document.querySelector<HTMLElement>(".map-switcher");
              if (sw) sw.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
          >
            <Layers className="ico" /> Layers
          </button>
          <button
            className="btn"
            type="button"
            disabled
            title="Soon — Candi will auto-cut balanced turfs from your filtered voters"
          >
            <Sparkles className="ico" /> AI cut turfs <span className="turf-soon">Soon</span>
          </button>
          {/* New turf: triggers the Mapbox Draw polygon tool in TurfMap. */}
          <button
            className="btn primary"
            type="button"
            onClick={() => (mapControls ?? mapControlsRef.current)?.startDraw()}
          >
            <Plus className="ico" /> New turf
          </button>
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
                Filter the voters you want on the map, then click <b>New turf</b> or use the polygon tool (top-left) to cut and save your first turf.
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
        <TurfMap voterPoints={voterPoints} onReady={handleMapReady} />

        {/* ── Turf detail ───────────────────────────────────────────── */}
        {sel && (
          <TurfDetail
            key={sel.id}
            t={sel}
            members={members}
            onClose={() => setSelId(null)}
          />
        )}
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

function TurfDetail({
  t,
  members,
  onClose,
}: {
  t: TurfListItem;
  members: CampaignMember[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAssign = (memberId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await assignTurf(t.id, memberId === "" ? null : memberId);
      if (!res.ok) {
        setActionError(res.error ?? "Failed to update assignee");
        return;
      }
      router.refresh();
    });
  };

  const handleStatus = (status: "queued" | "active" | "complete") => {
    setActionError(null);
    startTransition(async () => {
      const res = await setTurfStatus(t.id, status);
      if (!res.ok) {
        setActionError(res.error ?? "Failed to update status");
        return;
      }
      router.refresh();
    });
  };

  // Current assignee membership id, derived from the members list.
  const currentAssigneeId = members.find((m) => m.name === t.assignee)?.id ?? "";

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div>
          <div className="row" style={{ gap: 6 }}>
            <StatusBadge status={t.status} complete="complete" />
            {t.hasBoundary && <span className="tag mono">on map</span>}
            {isPending && <span className="muted" style={{ fontSize: 11 }}>Saving…</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{t.name}</div>
        </div>
        <X className="x" style={{ width: 16, height: 16 }} onClick={onClose} />
      </div>

      {actionError && (
        <div style={{ margin: "0 14px", padding: "8px 12px", borderRadius: 8, background: "var(--rose-2)", color: "var(--rose)", fontSize: 12 }}>
          ⚠ {actionError}
        </div>
      )}

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

        {/* ── Assignment ───────────────────────────────────────────── */}
        <div className="turf-detail-section">
          <div className="turf-detail-h">Assignment</div>
          <div className="field-row">
            <div className="lbl">Status</div>
            <div className="val">
              <div className="turf-select-wrap">
                <select
                  className="map-select"
                  value={t.status}
                  disabled={isPending}
                  onChange={(e) => handleStatus(e.target.value as "queued" | "active" | "complete")}
                  style={{ width: "100%" }}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown style={{ width: 12, height: 12, pointerEvents: "none" }} />
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="lbl">Assignee</div>
            <div className="val">
              {members.length === 0 ? (
                <span className="muted" style={{ fontSize: 12 }}>No canvassers in this campaign yet.</span>
              ) : (
                <div className="turf-select-wrap">
                  <select
                    className="map-select"
                    value={currentAssigneeId}
                    disabled={isPending}
                    onChange={(e) => handleAssign(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} · {m.role}</option>
                    ))}
                  </select>
                  <ChevronDown style={{ width: 12, height: 12, pointerEvents: "none" }} />
                </div>
              )}
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

        {/* ── Planning (coming soon) ───────────────────────────────── */}
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

// Keep initialsOf in scope (used in TurfDetail avatar pattern — exported for
// potential reuse elsewhere; suppresses unused-variable lint)
void initialsOf;
