"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Layers, Scissors, Plus, Search, SlidersHorizontal, X,
  MapPinned, Users, DoorOpen, Route, FileText, Activity,
  ChevronDown, Trash2, Pencil, Check, Map as MapIcon,
} from "lucide-react";
import type { VoterPoint, TurfListItem, TurfStats, CampaignMember } from "@/app/(app)/canvassing/actions";
import { assignTurf, setTurfStatus, deleteTurf, renameTurf } from "@/app/(app)/canvassing/actions";
import dynamic from "next/dynamic";
import type { TurfMapControls } from "@/components/canvassing/turf-map";
import { CanvassersView } from "@/components/canvassing/canvassers-view";

const TurfMap = dynamic(() => import("@/components/canvassing/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => (
    <div className="map-wrap" style={{ display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>
      Loading map…
    </div>
  ),
});

const STATUS_GROUPS = [
  { key: "active",   label: "Active",   dot: "dot live" },
  { key: "complete", label: "Complete", dot: "dot ok"   },
  { key: "queued",   label: "Queued",   dot: "dot"      },
] as const;

const STATUS_OPTIONS = [
  { value: "queued",   label: "Queued"   },
  { value: "active",   label: "Active"   },
  { value: "complete", label: "Complete" },
] as const;

type RouteResult = { stops: number; distanceMi?: number; error?: string };

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

  const [tab, setTab] = useState<"map" | "canvassers">("map");
  const [selId, setSelId] = useState<string | null>(null);
  useEffect(() => {
    if (selId !== null && !turfs.some((t) => t.id === selId)) setSelId(null);
  }, [turfs, selId]);
  const sel = useMemo(() => turfs.find((t) => t.id === selId) ?? null, [turfs, selId]);

  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? turfs.filter((t) => `${t.name} ${t.assignee ?? ""}`.toLowerCase().includes(q)) : turfs;
  }, [turfs, search]);

  // Map controls exposed via onReady
  const [mapControls, setMapControls] = useState<TurfMapControls | null>(null);
  const mapControlsRef = useRef<TurfMapControls | null>(null);
  const handleMapReady = (controls: TurfMapControls) => {
    mapControlsRef.current = controls;
    setMapControls(controls);
  };
  const ctrl = () => mapControls ?? mapControlsRef.current;

  const onGenerateRoute = async (turfId: string): Promise<RouteResult> => {
    const c = ctrl();
    if (!c) return { stops: 0, error: "Map is still loading — try again in a second." };
    return c.generateRoute(turfId);
  };

  // Split-equally panel (was "AI cut turfs")
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitN, setSplitN] = useState(4);
  const [splitting, setSplitting] = useState(false);
  const [splitMsg, setSplitMsg] = useState<string | null>(null);

  const handleSplit = async () => {
    const c = ctrl();
    if (!c) return;
    setSplitting(true);
    setSplitMsg(null);
    const res = await c.splitEqually(splitN);
    setSplitting(false);
    if (res.error) setSplitMsg(`⚠ ${res.error}`);
    else {
      setSplitMsg(`✓ ${res.saved} turf${res.saved === 1 ? "" : "s"} created`);
      setTimeout(() => { setSplitOpen(false); setSplitMsg(null); }, 1400);
    }
  };

  const filteredCount = ctrl()?.getFilteredCount() ?? voterPoints.length;

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
        {tab === "map" && (
          <div className="acts" style={{ flexWrap: "wrap", gap: 6, position: "relative" }}>
            <button className="btn" type="button"
              title="Switch map style — use the style buttons on the map"
              onClick={() => document.querySelector<HTMLElement>(".map-switcher")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
            >
              <Layers className="ico" /> Layers
            </button>

            <button className={"btn" + (splitOpen ? " primary" : "")} type="button"
              onClick={() => { setSplitOpen((v) => !v); setSplitMsg(null); }}>
              <Scissors className="ico" /> Split equally
            </button>

            {splitOpen && (
              <div className="ai-cut-panel">
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Split into equal turfs</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                  Divides <b style={{ color: "var(--ink)" }}>{filteredCount.toLocaleString()}</b> filtered voters
                  into <b style={{ color: "var(--ink)" }}>{splitN}</b> roughly equal turfs by geography — a quick
                  way to share a district across canvassers.
                </div>
                <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12 }}>Number of turfs</span>
                  <span className="map-stepper">
                    <button type="button" aria-label="decrease" disabled={splitN <= 2 || splitting}
                      onClick={() => setSplitN((n) => Math.max(2, n - 1))}>−</button>
                    <span className="mono map-stepper-val">{splitN}</span>
                    <button type="button" aria-label="increase" disabled={splitN >= 12 || splitting}
                      onClick={() => setSplitN((n) => Math.min(12, n + 1))}>+</button>
                  </span>
                </div>
                {splitMsg && (
                  <div style={{ fontSize: 12, marginBottom: 8,
                    color: splitMsg.startsWith("⚠") ? "var(--rose)" : "var(--accent-ink)" }}>{splitMsg}</div>
                )}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost" type="button" style={{ flex: 1, fontSize: 12 }}
                    disabled={splitting} onClick={() => setSplitOpen(false)}>Cancel</button>
                  <button className="btn primary" type="button" style={{ flex: 1, fontSize: 12 }}
                    disabled={splitting || filteredCount === 0} onClick={handleSplit}>
                    {splitting ? "Splitting…" : "Split"}
                  </button>
                </div>
              </div>
            )}

            <button className="btn primary" type="button" onClick={() => ctrl()?.startDraw()}>
              <Plus className="ico" /> New turf
            </button>
          </div>
        )}
      </div>

      {/* Sub-tabs: Map | Canvassers */}
      <div className="turf-subtabs">
        <button type="button" className={"turf-subtab" + (tab === "map" ? " on" : "")}
          onClick={() => setTab("map")}>
          <MapIcon style={{ width: 14, height: 14 }} /> Map
        </button>
        <button type="button" className={"turf-subtab" + (tab === "canvassers" ? " on" : "")}
          onClick={() => setTab("canvassers")}>
          <Users style={{ width: 14, height: 14 }} /> Canvassers
          <span className="turf-subtab-n mono">{hdr.canvassers}</span>
        </button>
      </div>

      {tab === "map" ? (
        <div className={"turf-body" + (sel ? " detail-open" : "")}>
          {/* Turf list */}
          <aside className="turf-list">
            <div className="vot-toolbar" style={{ padding: "10px 14px" }}>
              <div className="row" style={{ gap: 6, flex: 1 }}>
                <Search style={{ width: 13, height: 13, color: "var(--muted)" }} />
                <input className="turf-filter-input" placeholder="Filter turfs"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn ghost" type="button"><SlidersHorizontal style={{ width: 13, height: 13 }} /></button>
            </div>

            {turfs.length === 0 ? (
              <div className="turf-empty">
                <span className="turf-empty-ico"><MapPinned style={{ width: 20, height: 20 }} /></span>
                <b>No turfs yet</b>
                <span className="muted">
                  Filter the voters you want, then click <b>New turf</b>, use the polygon tool
                  (top-left), or <b>Split equally</b> to divide the district.
                </span>
              </div>
            ) : (
              STATUS_GROUPS.map((g) => {
                const rows = visible.filter((t) => t.status === g.key);
                if (rows.length === 0) return null;
                return (
                  <div className="turf-section" key={g.key}>
                    <div className="turf-section-h">
                      <span className={g.dot} /> {g.label}{" "}
                      <span className="turf-section-n mono">{rows.length}</span>
                    </div>
                    {rows.map((t) => (
                      <TurfRow key={t.id} t={t} active={t.id === selId}
                        onSelect={() => setSelId(t.id === selId ? null : t.id)} />
                    ))}
                  </div>
                );
              })
            )}
          </aside>

          {/* Map */}
          <TurfMap
            voterPoints={voterPoints}
            selectedTurfId={selId}
            onReady={handleMapReady}
            onTurfClick={(id) => setSelId((cur) => (cur === id ? null : id))}
          />

          {/* Detail drawer */}
          {sel && (
            <TurfDetail key={sel.id} t={sel} members={members}
              onGenerateRoute={onGenerateRoute} onClose={() => setSelId(null)} />
          )}
        </div>
      ) : (
        <CanvassersView turfs={turfs} members={members} />
      )}
    </div>
  );
}

function StatusBadge({ status, complete = "done" }: { status: string; complete?: string }) {
  if (status === "active")   return <span className="tag accent">live</span>;
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
        <span className="row" style={{ gap: 5 }}>
          {t.routeStops > 0 && <span className="tag mono turf-card-maptag"><Route className="turf-mi" /> route</span>}
          {t.hasBoundary && <span className="tag mono turf-card-maptag"><MapPinned className="turf-mi" /> map</span>}
        </span>
      </div>
    </button>
  );
}

function TurfDetail({
  t,
  members,
  onGenerateRoute,
  onClose,
}: {
  t: TurfListItem;
  members: CampaignMember[];
  onGenerateRoute: (turfId: string) => Promise<RouteResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(t.name);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renaming) nameRef.current?.select(); }, [renaming]);

  // Route generation
  const [routing, setRouting] = useState(false);
  const [routeErr, setRouteErr] = useState<string | null>(null);
  const [routeMsg, setRouteMsg] = useState<string | null>(null);

  const runRoute = async () => {
    setRouting(true); setRouteErr(null); setRouteMsg(null);
    const r = await onGenerateRoute(t.id);
    setRouting(false);
    if (r.error) { setRouteErr(r.error); return; }
    setRouteMsg(`${r.stops} stops${r.distanceMi != null ? ` · ~${r.distanceMi.toFixed(1)} mi` : ""}`);
  };

  const commitRename = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === t.name) { setRenaming(false); setNameInput(t.name); return; }
    setActionError(null);
    startTransition(async () => {
      const res = await renameTurf(t.id, trimmed);
      if (!res.ok) { setActionError(res.error ?? "Failed to rename"); setNameInput(t.name); }
      else router.refresh();
      setRenaming(false);
    });
  };

  const handleAssign = (memberId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await assignTurf(t.id, memberId === "" ? null : memberId);
      if (!res.ok) { setActionError(res.error ?? "Failed to update assignee"); return; }
      router.refresh();
    });
  };

  const handleStatus = (status: "queued" | "active" | "complete") => {
    setActionError(null);
    startTransition(async () => {
      const res = await setTurfStatus(t.id, status);
      if (!res.ok) { setActionError(res.error ?? "Failed to update status"); return; }
      router.refresh();
    });
  };

  const handleDelete = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await deleteTurf(t.id);
      if (!res.ok) { setActionError(res.error ?? "Failed to delete turf"); setConfirmDelete(false); return; }
      router.refresh();
      onClose();
    });
  };

  const currentAssigneeId = members.find((m) => m.name === t.assignee)?.id ?? "";

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6 }}>
            <StatusBadge status={t.status} complete="complete" />
            {t.hasBoundary && <span className="tag mono">on map</span>}
            {isPending && <span className="muted" style={{ fontSize: 11 }}>Saving…</span>}
          </div>
          {renaming ? (
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <input ref={nameRef} className="turf-rename-input" value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") { setRenaming(false); setNameInput(t.name); }
                }}
                onBlur={commitRename} disabled={isPending} />
              <button type="button" className="btn ghost" style={{ padding: "3px 6px" }}
                onMouseDown={(e) => { e.preventDefault(); commitRename(); }}>
                <Check style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ) : (
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.name}
              </div>
              <button type="button" className="btn ghost" style={{ padding: "2px 5px", flexShrink: 0 }}
                title="Rename turf" onClick={() => { setNameInput(t.name); setRenaming(true); }}>
                <Pencil style={{ width: 12, height: 12 }} />
              </button>
            </div>
          )}
        </div>
        <X className="x" style={{ width: 16, height: 16, flexShrink: 0 }} onClick={onClose} />
      </div>

      {actionError && (
        <div style={{ margin: "0 14px", padding: "8px 12px", borderRadius: 8, background: "var(--rose-2,#fff1f2)", color: "var(--rose)", fontSize: 12 }}>
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

        {/* Assignment */}
        <div className="turf-detail-section">
          <div className="turf-detail-h">Assignment</div>
          <div className="field-row">
            <div className="lbl">Status</div>
            <div className="val">
              <div className="turf-select-wrap">
                <select className="map-select" value={t.status} disabled={isPending}
                  onChange={(e) => handleStatus(e.target.value as "queued" | "active" | "complete")}
                  style={{ width: "100%" }}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown style={{ width: 12, height: 12, pointerEvents: "none" }} />
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="lbl">Assignee</div>
            <div className="val">
              {members.length === 0 ? (
                <span className="muted" style={{ fontSize: 12 }}>No members yet.</span>
              ) : (
                <div className="turf-select-wrap">
                  <select className="map-select" value={currentAssigneeId} disabled={isPending}
                    onChange={(e) => handleAssign(e.target.value)} style={{ width: "100%" }}>
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
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

        {/* Walking route */}
        <div className="turf-detail-section">
          <div className="turf-detail-h">Walking route</div>
          <div className="field-row">
            <div className="lbl">Route</div>
            <div className="val">
              {t.routeStops > 0
                ? <span className="row" style={{ gap: 5 }}><Route style={{ width: 13, height: 13, color: "var(--accent-deep)" }} /> {t.routeStops} stops optimized</span>
                : <span className="muted">Not generated yet</span>}
            </div>
          </div>
          <button type="button" className="btn" style={{ width: "100%", gap: 6, marginTop: 4 }}
            disabled={routing || !t.hasBoundary} onClick={runRoute}>
            <Route style={{ width: 13, height: 13 }} />
            {routing ? "Optimizing…" : t.routeStops > 0 ? "Regenerate route" : "Generate route"}
          </button>
          {!t.hasBoundary && (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Draw a boundary on the map to enable routing.</div>
          )}
          {routeMsg && !routeErr && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--accent-ink)" }}>✓ Route ready · {routeMsg}</div>
          )}
          {routeErr && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--rose)" }}>⚠ {routeErr}</div>
          )}
        </div>

        {/* Planning (coming soon) */}
        <div className="turf-detail-section">
          <div className="turf-detail-h">Planning</div>
          <div className="turf-soon-row">
            <FileText className="turf-soon-ico" />
            <span className="turf-soon-label">Canvassing script</span>
            <span className="turf-soon-tag">Not yet assigned</span>
          </div>
          <div className="turf-soon-row">
            <Activity className="turf-soon-ico" />
            <span className="turf-soon-label">Per-door activity</span>
            <span className="turf-soon-tag">Not tracked yet</span>
          </div>
        </div>

        {/* Delete */}
        <div className="turf-detail-section" style={{ marginTop: "auto", paddingTop: 16 }}>
          {confirmDelete ? (
            <div className="turf-delete-confirm">
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                Delete <b>{t.name}</b>? This can&apos;t be undone.
              </span>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button type="button" className="btn ghost" style={{ flex: 1, fontSize: 12 }}
                  disabled={isPending} onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="btn"
                  style={{ flex: 1, fontSize: 12, background: "var(--rose)", color: "#fff", borderColor: "var(--rose)" }}
                  disabled={isPending} onClick={handleDelete}>
                  {isPending ? "Deleting…" : "Delete turf"}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn ghost"
              style={{ width: "100%", color: "var(--rose)", borderColor: "var(--rose,#f43f5e)", fontSize: 13, gap: 6 }}
              disabled={isPending} onClick={() => setConfirmDelete(true)}>
              <Trash2 style={{ width: 13, height: 13 }} /> Delete turf
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
