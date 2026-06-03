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
  type SavedTurf,
  type GeoPolygon,
  type VoterPoint,
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
  /** Auto-cut n balanced turfs from the currently filtered voter set. */
  autoCut: (n: number) => Promise<{ saved: number; error?: string }>;
  /** Current count of filtered voters (for the AI-cut panel label). */
  getFilteredCount: () => number;
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

    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
    drawRef.current = draw;
    map.addControl(draw as unknown as mapboxgl.IControl, "top-left");

    map.on("load", () => {
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

      autoCut: async (n: number) => {
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

      getFilteredCount: () => filteredRef.current.length,
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

  // ── Effect 3: highlight the selected turf ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("selected-turf") as mapboxgl.GeoJSONSource | undefined)
        ?.setData(selectedTurfFeatures(saved, selectedTurfId ?? null));
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

      {/* Filter bar */}
      <div className="map-overlay map-filter">
        <div className="map-filter-head">
          <span className="map-overlay-title">Filter doors</span>
          <span className="map-filter-count mono">{filtered.length}/{voterPoints.length}</span>
        </div>
        <div className="map-party-row">
          {(["D", "R", "I"] as Party[]).map((k) => (
            <button key={k} type="button" className="map-party-btn" aria-pressed={party[k]}
              onClick={() => togglePartyKey(k)}
              style={{
                border: `1px solid ${party[k] ? PARTY_COLOR[k] : "var(--border)"}`,
                background: party[k] ? PARTY_COLOR[k] : "transparent",
                color: party[k] ? "#fff" : "var(--ink-2)",
              }}
            >{k}</button>
          ))}
        </div>
        <label className="map-filter-check">
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
