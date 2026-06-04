"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import {
  saveTurf,
  listTurfs,
  setTurfRoute,
  splitTurf,
  type SavedTurf,
  type GeoPolygon,
  type VoterPoint,
  type RouteStop,
} from "@/app/(app)/canvassing/actions";
import { voteCount, MAX_M, type VoteHistoryMap } from "@/lib/elections";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const STYLES = [
  { label: "Streets",   url: "mapbox://styles/mapbox/streets-v12" },
  { label: "Satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { label: "Light",     url: "mapbox://styles/mapbox/light-v11" },
  { label: "Dark",      url: "mapbox://styles/mapbox/dark-v11" },
  { label: "Outdoors",  url: "mapbox://styles/mapbox/outdoors-v12" },
] as const;

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
const PARTY_COLOR: Record<string, string> = { D: "#6366f1", R: "#f43f5e", I: "#94a3b8" };
type Party = "D" | "R" | "I";

function turfFeatures(turfs: SavedTurf[]) {
  return {
    type: "FeatureCollection" as const,
    features: turfs.map((t) => ({
      type: "Feature" as const,
      geometry: t.boundary,
      properties: { id: t.id, name: t.name },
    })),
  };
}

function selectedTurfFeatures(turfs: SavedTurf[], selectedId: string | null) {
  const t = selectedId ? turfs.find((x) => x.id === selectedId) : null;
  if (!t) return EMPTY_FC;
  return {
    type: "FeatureCollection" as const,
    features: [{ type: "Feature" as const, geometry: t.boundary, properties: {} }],
  };
}

function pointFeatures(points: VoterPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { party: p.party ?? "I" },
    })),
  };
}

/** Ray-casting point-in-polygon (even-odd rule, first ring only). */
function pointInPolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointsBounds(points: VoterPoint[]): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  return [w, s, e, n];
}

// ── Walking-route optimization ──────────────────────────────────────────────
function haversineMi(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function routeLengthMi(stops: RouteStop[]): number {
  let d = 0;
  for (let i = 1; i < stops.length; i++) d += haversineMi(stops[i - 1], stops[i]);
  return d;
}

/** Nearest-neighbor seed + 2-opt refinement (open path). Good for a few hundred doors. */
function optimizeRoute(stops: RouteStop[]): RouteStop[] {
  const n = stops.length;
  if (n <= 2) return stops.slice();

  // Start from the south-west-most door (a natural corner).
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (stops[i].lat + stops[i].lng < stops[start].lat + stops[start].lng) start = i;
  }

  const used = new Array(n).fill(false);
  const order: RouteStop[] = [stops[start]];
  used[start] = true;
  let cur = start;
  for (let k = 1; k < n; k++) {
    let best = -1, bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const d = haversineMi(stops[cur], stops[j]);
      if (d < bestD) { bestD = d; best = j; }
    }
    used[best] = true;
    order.push(stops[best]);
    cur = best;
  }

  // 2-opt for an open path. Cap passes for large sets so it stays snappy.
  const maxPasses = n > 200 ? 1 : 5;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n; j++) {
        const a = order[i], b = order[i + 1], c = order[j];
        const dNext = j + 1 < n ? order[j + 1] : null;
        const before = haversineMi(a, b) + (dNext ? haversineMi(c, dNext) : 0);
        const after = haversineMi(a, c) + (dNext ? haversineMi(b, dNext) : 0);
        if (after + 1e-9 < before) {
          let lo = i + 1, hi = j;
          while (lo < hi) { const t = order[lo]; order[lo] = order[hi]; order[hi] = t; lo++; hi--; }
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return order;
}

function routeLineFC(stops: RouteStop[] | null) {
  if (!stops || stops.length < 2) return EMPTY_FC;
  return {
    type: "FeatureCollection" as const,
    features: [{
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: stops.map((s) => [s.lng, s.lat]) },
      properties: {},
    }],
  };
}

function routeEndsFC(stops: RouteStop[] | null) {
  if (!stops || stops.length === 0) return EMPTY_FC;
  const ends: Array<{ lng: number; lat: number; kind: string }> = [
    { lng: stops[0].lng, lat: stops[0].lat, kind: "start" },
  ];
  if (stops.length > 1) {
    const last = stops[stops.length - 1];
    ends.push({ lng: last.lng, lat: last.lat, kind: "end" });
  }
  return {
    type: "FeatureCollection" as const,
    features: ends.map((e) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
      properties: { kind: e.kind },
    })),
  };
}

/**
 * Auto-slice filtered voters into N balanced turfs (longitude-strip method).
 * Sorts voters W→E, splits into N equal-count strips, returns one padded
 * bounding-box polygon + counts per strip. Fast, client-side, no API needed.
 */
function autoSliceTurfs(
  points: VoterPoint[],
  n: number
): Array<{ geometry: GeoPolygon; voterCount: number; doorCount: number }> {
  if (points.length === 0 || n < 1) return [];
  const sorted = [...points].sort((a, b) => a.lng - b.lng);
  const chunkSize = Math.ceil(sorted.length / n);
  const results: Array<{ geometry: GeoPolygon; voterCount: number; doorCount: number }> = [];

  for (let i = 0; i < n; i++) {
    const chunk = sorted.slice(i * chunkSize, (i + 1) * chunkSize);
    if (chunk.length === 0) continue;

    const pad = 0.0008; // ~80 m padding around each cluster
    const west  = Math.min(...chunk.map((p) => p.lng)) - pad;
    const east  = Math.max(...chunk.map((p) => p.lng)) + pad;
    const south = Math.min(...chunk.map((p) => p.lat)) - pad;
    const north = Math.max(...chunk.map((p) => p.lat)) + pad;

    const addresses = new Set<string>();
    for (const p of chunk) addresses.add((p.address ?? p.external_id).trim().toLowerCase());

    results.push({
      geometry: {
        type: "Polygon",
        coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
      },
      voterCount: chunk.length,
      doorCount: addresses.size,
    });
  }
  return results;
}

/** Controls exposed to TurfView via onReady. */
export type TurfMapControls = {
  startDraw: () => void;
  /** Split the currently filtered voter set into n equal-count turfs (planning aid). */
  splitEqually: (n: number) => Promise<{ saved: number; error?: string }>;
  /** Optimize a walking route over the doors inside a saved turf, persist + draw it. */
  generateRoute: (turfId: string) => Promise<{ stops: number; distanceMi?: number; error?: string }>;
  /** Split a saved turf into n strips; the original is replaced by the children. */
  splitTurf: (turfId: string, n: number) => Promise<{ created: number; error?: string }>;
  /** Current count of filtered voters (for the split panel label). */
  getFilteredCount: () => number;
  /** Toggle the "Filter doors" overlay panel on/off. */
  toggleFilter: () => void;
};

export function TurfMap({
  voterPoints = [],
  selectedTurfId = null,
  onReady,
  onTurfClick,
}: {
  voterPoints?: VoterPoint[];
  /** Turf selected in the sidebar — highlighted on the map. */
  selectedTurfId?: string | null;
  onReady?: (controls: TurfMapControls) => void;
  /** Called when the user clicks a saved-turf polygon on the map. */
  onTurfClick?: (id: string) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const didFitRef = useRef(false);

  const [saved, setSaved] = useState<SavedTurf[]>([]);
  const [styleUrl, setStyleUrl] = useState<string>(STYLES[0].url);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filterVisible, setFilterVisible] = useState(true);

  // Filter state
  const [party, setParty] = useState<Record<Party, boolean>>({ D: true, R: true, I: true });
  const [svOn, setSvOn] = useState(false);
  const [svN, setSvN] = useState(3);
  const [svM, setSvM] = useState(MAX_M);
  const [supportMin, setSupportMin] = useState(0);

  // Doors-vs-people readout
  const [counts, setCounts] = useState<{ people: number; doors: number } | null>(null);
  const [countMode, setCountMode] = useState<"people" | "doors">("people");

  const filtered = useMemo(
    () =>
      voterPoints.filter((p) => {
        const pty = (p.party ?? "I") as Party;
        if (!party[pty]) return false;
        if (supportMin > 0 && (p.support ?? 0) < supportMin) return false;
        if (svOn && voteCount(p.history as VoteHistoryMap | null, svM) < svN) return false;
        return true;
      }),
    [voterPoints, party, supportMin, svOn, svN, svM]
  );

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // Keep a stable ref to onTurfClick to avoid stale closures in map handlers.
  const onTurfClickRef = useRef(onTurfClick);
  onTurfClickRef.current = onTurfClick;

  // Latest saved turfs for the (once-registered) generateRoute control.
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const refresh = async () => {
    const turfs = await listTurfs();
    setSaved(turfs);
    (mapRef.current?.getSource("saved-turfs") as mapboxgl.GeoJSONSource | undefined)
      ?.setData(turfFeatures(turfs));
    return turfs;
  };

  const addLayers = (map: mapboxgl.Map) => {
    // Saved turfs fill + outline
    if (!map.getSource("saved-turfs")) {
      map.addSource("saved-turfs", { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: "saved-fill", type: "fill", source: "saved-turfs",
        paint: { "fill-color": "#a3e635", "fill-opacity": 0.18 } });
      map.addLayer({ id: "saved-outline", type: "line", source: "saved-turfs",
        paint: { "line-color": "#4d7c0f", "line-width": 2 } });
    }
    // Selected-turf highlight (bright white outline)
    if (!map.getSource("selected-turf")) {
      map.addSource("selected-turf", { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: "selected-outline", type: "line", source: "selected-turf",
        paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 0.9 } });
      map.addLayer({ id: "selected-fill", type: "fill", source: "selected-turf",
        paint: { "fill-color": "#a3e635", "fill-opacity": 0.32 } });
    }
    // Walking route for the selected turf (line + start/end markers)
    if (!map.getSource("route-line")) {
      map.addSource("route-line", { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: "route-line-layer", type: "line", source: "route-line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1d4ed8", "line-width": 2.5, "line-dasharray": [2, 1.4], "line-opacity": 0.9 } });
      map.addSource("route-ends", { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: "route-ends-layer", type: "circle", source: "route-ends",
        paint: {
          "circle-radius": 6,
          "circle-color": ["match", ["get", "kind"], "start", "#16a34a", "end", "#f43f5e", "#1d4ed8"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        } });
    }
    // Voter points
    if (!map.getSource("voter-points")) {
      map.addSource("voter-points", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "voter-circles", type: "circle", source: "voter-points",
        paint: {
          "circle-radius":  ["interpolate", ["linear"], ["zoom"], 9, 2.4, 13, 4.5, 16, 7],
          "circle-color":   ["match", ["get", "party"], "D", PARTY_COLOR.D, "R", PARTY_COLOR.R, PARTY_COLOR.I],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.7,
        },
      });
    }
    (map.getSource("voter-points") as mapboxgl.GeoJSONSource | undefined)
      ?.setData(pointFeatures(filteredRef.current));
    void refresh();
  };

  // ── Map init (runs once) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[0].url,
      center: [-80.2064, 26.1645],
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

    // polygon tool only — turf deletion is selection-driven (drawer + multi-select),
    // not the Draw trash control (which only removes an in-progress scratch shape).
    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: false } });
    drawRef.current = draw;
    map.addControl(draw as unknown as mapboxgl.IControl, "top-left");

    map.on("load", () => {
      // Force a resize on first load. The component is loaded via next/dynamic
      // (ssr:false), so Mapbox initializes before the browser has settled the
      // grid layout — the canvas renders transparent until it knows its size.
      map.resize();
      addLayers(map);

      // Hover cursor on saved turfs
      map.on("mouseenter", "saved-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "saved-fill", () => { map.getCanvas().style.cursor = ""; });

      // Click on a saved turf → select it in the sidebar
      map.on("click", "saved-fill", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onTurfClickRef.current?.(id);
      });
    });

    // Manual polygon draw → count, save, refresh
    map.on("draw.create", async (e: { features: Array<{ id?: string | number; geometry: { type: string; coordinates: number[][][] } }> }) => {
      const f = e.features?.[0];
      if (!f || f.geometry?.type !== "Polygon") return;
      const ring = f.geometry.coordinates[0] ?? [];

      const addresses = new Set<string>();
      let people = 0;
      for (const p of filteredRef.current) {
        if (!pointInPolygon(p.lng, p.lat, ring)) continue;
        people++;
        addresses.add((p.address ?? p.external_id).trim().toLowerCase());
      }
      const doors = addresses.size;
      setCounts({ people, doors });
      setSaveError(null);

      setSaving(true);
      const result = await saveTurf(f.geometry as GeoPolygon, { voterCount: people, doorCount: doors });
      setSaving(false);

      if (!result.ok) {
        setSaveError(result.error ?? "Save failed — turf not saved. Check your connection and try again.");
        return;
      }
      if (f.id != null) draw.delete(String(f.id));
      await refresh();
      router.refresh();
    });

    // Expose controls to TurfView
    onReady?.({
      startDraw: () => draw.changeMode("draw_polygon"),

      splitEqually: async (n: number) => {
        const slices = autoSliceTurfs(filteredRef.current, n);
        if (slices.length === 0) return { saved: 0, error: "No voters match the current filter" };
        let savedCount = 0;
        for (const s of slices) {
          const res = await saveTurf(s.geometry, { voterCount: s.voterCount, doorCount: s.doorCount });
          if (res.ok) savedCount++;
        }
        await refresh();
        router.refresh();
        return { saved: savedCount };
      },

      generateRoute: async (turfId: string) => {
        const turf = savedRef.current.find((t) => t.id === turfId);
        if (!turf?.boundary || turf.boundary.type !== "Polygon") {
          return { stops: 0, error: "This turf has no drawn boundary to route." };
        }
        const ring = turf.boundary.coordinates[0] ?? [];
        // Walk the doors the canvasser is currently targeting (filtered set),
        // deduped by address so one stop = one household/door.
        const byAddress = new Map<string, RouteStop>();
        for (const p of filteredRef.current) {
          if (!pointInPolygon(p.lng, p.lat, ring)) continue;
          const key = (p.address ?? p.external_id).trim().toLowerCase();
          if (!byAddress.has(key)) {
            byAddress.set(key, { lng: p.lng, lat: p.lat, address: p.address ?? "Unknown address" });
          }
        }
        const stops = [...byAddress.values()];
        if (stops.length === 0) {
          return { stops: 0, error: "No doors match the current filter inside this turf." };
        }
        const ordered = optimizeRoute(stops);
        const distanceMi = routeLengthMi(ordered);
        const res = await setTurfRoute(turfId, ordered);
        if (!res.ok) return { stops: 0, error: res.error ?? "Failed to save route" };
        // Draw immediately, then refresh map + server state.
        (map.getSource("route-line") as mapboxgl.GeoJSONSource | undefined)?.setData(routeLineFC(ordered));
        (map.getSource("route-ends") as mapboxgl.GeoJSONSource | undefined)?.setData(routeEndsFC(ordered));
        await refresh();
        router.refresh();
        return { stops: ordered.length, distanceMi };
      },

      splitTurf: async (turfId: string, n: number) => {
        const res = await splitTurf(turfId, n);
        if (!res.ok) return { created: 0, error: res.error ?? "Failed to split turf" };
        await refresh();
        router.refresh();
        return { created: res.created ?? 0 };
      },

      getFilteredCount: () => filteredRef.current.length,
      toggleFilter: () => setFilterVisible((v) => !v),
    });

    return () => {
      map.remove();
      mapRef.current = null;
      didFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 1: update circle layer on any filter change ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("voter-points") as mapboxgl.GeoJSONSource | undefined)
        ?.setData(pointFeatures(filtered));
      if (!didFitRef.current) {
        const b = pointsBounds(filtered);
        if (b) {
          map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 64, maxZoom: 15, duration: 0 });
          didFitRef.current = true;
        }
      }
    };
    if (map.isStyleLoaded() && map.getSource("voter-points")) apply();
    else map.once("idle", apply);
  }, [filtered]);

  // ── Effect 2: refit only on big filter changes (not party toggles) ──────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !didFitRef.current) return;
    const b = pointsBounds(filteredRef.current);
    if (!b) return;
    const apply = () => {
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 64, maxZoom: 15, duration: 600 });
    };
    if (map.isStyleLoaded() && map.getSource("voter-points")) apply();
    else map.once("idle", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svOn, svN, svM, supportMin]);

  // ── Effect 3: highlight the selected turf + draw its walking route ─────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("selected-turf") as mapboxgl.GeoJSONSource | undefined)
        ?.setData(selectedTurfFeatures(saved, selectedTurfId ?? null));
      const t = selectedTurfId ? saved.find((x) => x.id === selectedTurfId) : null;
      const route = t?.route ?? null;
      (map.getSource("route-line") as mapboxgl.GeoJSONSource | undefined)?.setData(routeLineFC(route));
      (map.getSource("route-ends") as mapboxgl.GeoJSONSource | undefined)?.setData(routeEndsFC(route));
    };
    if (map.isStyleLoaded() && map.getSource("selected-turf")) apply();
    else map.once("idle", apply);
  }, [selectedTurfId, saved]);

  const switchStyle = (url: string) => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(url);
    map.once("style.load", () => addLayers(map));
    setStyleUrl(url);
  };

  if (!TOKEN) {
    return (
      <div className="map-wrap" style={{ display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13, padding: 24, textAlign: "center" }}>
        Set <code className="mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> in .env.local to load the turf map.
      </div>
    );
  }

  const togglePartyKey = (k: Party) => setParty((p) => ({ ...p, [k]: !p[k] }));
  const setM = (next: number) => { const mm = Math.max(2, Math.min(MAX_M, next)); setSvM(mm); setSvN((n) => Math.min(n, mm)); };
  const setN = (next: number) => setSvN(Math.max(1, Math.min(svM, next)));

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Filter bar — toggled by the Layers button in the header */}
      <div className={"map-overlay map-filter" + (filterVisible ? "" : " map-filter-hidden")}>
        <div className="map-filter-head">
          <span className="map-overlay-title">Filter doors</span>
          <span className="map-filter-count mono">{filtered.length}/{voterPoints.length}</span>
        </div>
        <div className="map-party-row">
          {(["D", "R", "I"] as Party[]).map((k) => {
            const partyLabel = k === "D" ? "Democrats" : k === "R" ? "Republicans" : "Independents";
            return (
              <button key={k} type="button" className="map-party-btn" aria-pressed={party[k]}
                title={`${party[k] ? "Hide" : "Show"} ${partyLabel}`}
                aria-label={`Toggle ${partyLabel}`}
                onClick={() => togglePartyKey(k)}
                style={{
                  border: `1px solid ${party[k] ? PARTY_COLOR[k] : "var(--border)"}`,
                  background: party[k] ? PARTY_COLOR[k] : "transparent",
                  color: party[k] ? "#fff" : "var(--ink-2)",
                }}
              >{k}</button>
            );
          })}
        </div>
        <label className="map-filter-check"
          title="Super voters: people who turned out in at least N of the last M elections — your highest-propensity doors.">
          <input type="checkbox" checked={svOn} onChange={(e) => setSvOn(e.target.checked)} />
          <span>Super voters only</span>
        </label>
        {svOn && filtered.length === 0 && voterPoints.length > 0 && (
          <div className="map-filter-warn">
            No vote history on file yet — request the VAN export to unlock this filter.
          </div>
        )}
        <div className="map-filter-sv" style={{ opacity: svOn ? 1 : 0.45, pointerEvents: svOn ? "auto" : "none" }}>
          <span className="muted">≥</span>
          <Stepper value={svN} min={1} max={svM} onChange={setN} />
          <span className="muted">of last</span>
          <Stepper value={svM} min={2} max={MAX_M} onChange={setM} />
        </div>
        <label className="map-filter-support">
          <span>Support ≥</span>
          <select className="map-select" value={supportMin} onChange={(e) => setSupportMin(Number(e.target.value))}>
            <option value={0}>Any</option>
            {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}+</option>)}
          </select>
        </label>
      </div>

      {/* Style switcher */}
      <div className="map-switcher">
        {STYLES.map((s) => (
          <button key={s.url} type="button"
            className={"map-switcher-btn" + (styleUrl === s.url ? " active" : "")}
            aria-pressed={styleUrl === s.url} onClick={() => switchStyle(s.url)}
          >{s.label}</button>
        ))}
      </div>

      {/* Legend */}
      <div className="map-legend">
        {saveError && <div className="map-legend-error" role="alert">⚠ {saveError}</div>}
        {counts && !saveError ? (
          <>
            <div className="map-legend-count">
              <span className="serif map-legend-n">
                {(countMode === "people" ? counts.people : counts.doors).toLocaleString()}
              </span>
              <span className="muted map-legend-unit">{countMode === "people" ? "people" : "doors"} in turf</span>
            </div>
            <div className="map-seg">
              {(["doors", "people"] as const).map((m) => (
                <button key={m} type="button"
                  className={"map-seg-btn" + (countMode === m ? " active" : "")}
                  aria-pressed={countMode === m} onClick={() => setCountMode(m)}
                  title={m === "doors" ? "Doors = unique households (one stop per address)" : "People = individual voters inside the turf"}
                >{m === "doors" ? `${counts.doors} doors` : `${counts.people} people`}</button>
              ))}
            </div>
          </>
        ) : !saveError ? (
          <div className="map-legend-hint">
            <span className="map-legend-swatch" />
            Click a turf to select · polygon tool to draw
          </div>
        ) : null}
        <div className="map-legend-foot muted">
          {saving ? "Saving…" : `${saved.length} turf${saved.length === 1 ? "" : "s"} saved · ${filtered.length} doors shown`}
        </div>
      </div>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span className="map-stepper">
      <button type="button" aria-label="decrease" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="mono map-stepper-val">{value}</span>
      <button type="button" aria-label="increase" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}
