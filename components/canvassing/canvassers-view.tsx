"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Route, MapPin, Navigation, ChevronDown, Users } from "lucide-react";
import type { TurfListItem, CampaignMember, CanvasserLocation } from "@/app/(app)/canvassing/actions";
import { assignTurf, getCanvasserLocations } from "@/app/(app)/canvassing/actions";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "··";
}

function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const STATUS_LABEL: Record<CanvasserLocation["status"], string> = {
  active: "Active now", idle: "Idle", offline: "Offline",
};

// ── Live tracking map (dynamic Mapbox, client-only) ───────────────────────────
function CanvasserLiveMap({
  locations,
  nameById,
}: {
  locations: CanvasserLocation[];
  nameById: Map<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !TOKEN || !containerRef.current || mapRef.current) return;
    import("mapbox-gl").then((mod) => {
      const mapboxgl = mod.default;
      import("mapbox-gl/dist/mapbox-gl.css");
      mapboxgl.accessToken = TOKEN;
      const first = locations[0];
      const center: [number, number] = first ? [first.lng, first.lat] : [-80.13, 26.30];
      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/light-v11",
        center,
        zoom: 12,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on("load", () => map.resize());
    });
    return () => {
      try { mapRef.current?.remove?.(); } catch { /* noop */ }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever the polled locations change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof window === "undefined") return;
    import("mapbox-gl").then((mod) => {
      const mapboxgl = mod.default;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const bounds = new mapboxgl.LngLatBounds();
      for (const loc of locations) {
        const el = document.createElement("div");
        el.className = "canv-live-marker " + loc.status;
        el.textContent = initials(nameById.get(loc.membershipId) ?? "?");
        el.title = `${nameById.get(loc.membershipId) ?? "Canvasser"} · ${loc.doorsToday} doors today · ${relTime(loc.updatedAt)}`;
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([loc.lng, loc.lat]).addTo(map);
        markersRef.current.push(marker);
        bounds.extend([loc.lng, loc.lat]);
      }
      if (locations.length === 1) {
        map.easeTo({ center: [locations[0].lng, locations[0].lat], zoom: 14, duration: 500 });
      } else if (locations.length > 1 && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 500 });
      }
    });
  }, [locations, nameById]);

  if (!TOKEN) return null;
  return (
    <div className="canv-live-map">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {locations.length === 0 && (
        <div className="canv-live-empty">
          <Navigation style={{ width: 16, height: 16 }} />
          No canvassers live yet — locations appear here when they start walking a turf in the field app.
        </div>
      )}
    </div>
  );
}

export function CanvassersView({
  turfs,
  members,
}: {
  turfs: TurfListItem[];
  members: CampaignMember[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Live locations — fetched on mount, then polled every 15s for near-real-time.
  const [locations, setLocations] = useState<CanvasserLocation[]>([]);
  useEffect(() => {
    let alive = true;
    const tick = () => { getCanvasserLocations().then((l) => { if (alive) setLocations(l); }).catch(() => {}); };
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const locById = new Map(locations.map((l) => [l.membershipId, l]));
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  const assign = (turfId: string, memberId: string | null) => {
    setErr(null);
    startTransition(async () => {
      const r = await assignTurf(turfId, memberId);
      if (!r.ok) { setErr(r.error ?? "Failed to update assignment"); return; }
      router.refresh();
    });
  };

  const turfsFor = (id: string) => turfs.filter((t) => t.assigneeId === id);
  const unassigned = turfs.filter((t) => !t.assigneeId);

  const roster = [...members]
    .sort((a, b) => {
      const ac = a.role === "canvasser" ? 0 : 1, bc = b.role === "canvasser" ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.name.localeCompare(b.name);
    })
    .filter((m) => m.role === "canvasser" || turfsFor(m.id).length > 0);

  const liveCount = locations.filter((l) => l.status === "active").length;

  return (
    <div className="canv-tab">
      {err && <div className="canv-tab-err">⚠ {err}</div>}

      {/* Live tracking map */}
      <div className="canv-live-head">
        <div className="turf-detail-h" style={{ margin: 0 }}>Live field map</div>
        <span className="canv-live-count">
          <span className="canv-live-dot active" /> {liveCount} active now · {locations.length} tracked
        </span>
      </div>
      <CanvasserLiveMap locations={locations} nameById={nameById} />

      {roster.length === 0 ? (
        <div className="turf-empty" style={{ maxWidth: 420, margin: "40px auto" }}>
          <span className="turf-empty-ico"><Users style={{ width: 20, height: 20 }} /></span>
          <b>No canvassers yet</b>
          <span className="muted">
            Add canvassers to this campaign&apos;s workspace, then assign them turfs and routes here.
          </span>
        </div>
      ) : (
        <div className="canv-grid">
          {roster.map((m) => {
            const mine = turfsFor(m.id);
            const doors = mine.reduce((n, t) => n + t.doorCount, 0);
            const routed = mine.filter((t) => t.routeStops > 0).length;
            const loc = locById.get(m.id);
            return (
              <div className="canv-card" key={m.id}>
                <div className="canv-card-head">
                  <span className="avatar">{initials(m.name)}</span>
                  <div className="canv-card-id">
                    <b>{m.name}</b>
                    <span className="muted">{m.role}</span>
                  </div>
                  <span className="canv-card-stat mono">
                    {mine.length} turf{mine.length === 1 ? "" : "s"} · {doors.toLocaleString()} doors
                  </span>
                </div>

                {/* Live status — real GPS + doors-knocked-today from the field app */}
                <div className={"canv-gps" + (loc ? " live" : "")}>
                  {loc ? (
                    <>
                      <span className={"canv-live-dot " + loc.status} />
                      <span className="canv-gps-status">{STATUS_LABEL[loc.status]}</span>
                      <span className="canv-gps-sep">·</span>
                      <span className="mono">{loc.doorsToday}</span> knocked today
                      <span className="canv-gps-seen muted">· {relTime(loc.updatedAt)}</span>
                    </>
                  ) : (
                    <>
                      <Navigation style={{ width: 13, height: 13 }} />
                      Not in the field yet
                    </>
                  )}
                </div>

                {mine.length === 0 ? (
                  <div className="canv-none muted">No turfs assigned yet</div>
                ) : (
                  <div className="canv-turf-list">
                    {mine.map((t) => (
                      <div className="canv-turf-row" key={t.id}>
                        <MapPin style={{ width: 13, height: 13, color: "var(--muted)", flexShrink: 0 }} />
                        <span className="canv-turf-name">{t.name}</span>
                        <span className="muted mono canv-turf-doors">{t.doorCount.toLocaleString()}</span>
                        {t.routeStops > 0 ? (
                          <span className="tag accent canv-route-tag"><Route style={{ width: 11, height: 11 }} /> {t.routeStops}</span>
                        ) : (
                          <span className="tag canv-route-tag">no route</span>
                        )}
                        <button type="button" className="canv-unassign" disabled={isPending}
                          onClick={() => assign(t.id, null)}>Unassign</button>
                      </div>
                    ))}
                    {routed < mine.length && (
                      <div className="canv-hint muted">
                        {mine.length - routed} turf{mine.length - routed === 1 ? "" : "s"} still need a route
                        — open it on the Map tab and hit Generate route.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned turfs → assign to a canvasser */}
      <div className="canv-unassigned">
        <div className="turf-detail-h">
          Unassigned turfs <span className="mono">{unassigned.length}</span>
        </div>
        {unassigned.length === 0 ? (
          <span className="muted" style={{ fontSize: 13 }}>Every turf is assigned. 🎉</span>
        ) : (
          unassigned.map((t) => (
            <div className="canv-turf-row canv-turf-row-wide" key={t.id}>
              <DoorOpen style={{ width: 13, height: 13, color: "var(--muted)", flexShrink: 0 }} />
              <span className="canv-turf-name">{t.name}</span>
              <span className="muted mono canv-turf-doors">{t.doorCount.toLocaleString()} doors</span>
              {t.routeStops > 0 ? (
                <span className="tag accent canv-route-tag"><Route style={{ width: 11, height: 11 }} /> {t.routeStops}</span>
              ) : (
                <span className="tag canv-route-tag">no route</span>
              )}
              <div className="turf-select-wrap" style={{ marginLeft: "auto", minWidth: 150 }}>
                <select className="map-select" value="" disabled={isPending || members.length === 0}
                  onChange={(e) => { if (e.target.value) assign(t.id, e.target.value); }}
                  style={{ width: "100%" }}>
                  <option value="">Assign to…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                </select>
                <ChevronDown style={{ width: 12, height: 12, pointerEvents: "none" }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
