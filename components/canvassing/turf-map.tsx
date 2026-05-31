"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  { label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
  { label: "Satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { label: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { label: "Dark", url: "mapbox://styles/mapbox/dark-v11" },
  { label: "Outdoors", url: "mapbox://styles/mapbox/outdoors-v12" },
] as const;

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

// Party → circle color (matches the design system: D indigo / R rose / I muted).
const PARTY_COLOR: Record<string, string> = { D: "#6366f1", R: "#f43f5e", I: "#94a3b8" };
type Party = "D" | "R" | "I";

function turfFeatures(turfs: SavedTurf[]) {
  return {
    type: "FeatureCollection" as const,
    features: turfs.map((t) => ({ type: "Feature" as const, geometry: t.boundary, properties: { name: t.name } })),
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

/**
 * Ray-casting point-in-polygon (even-odd rule). Tests the FIRST ring of a GeoJSON
 * Polygon — sufficient for hand-drawn turf (no holes). No turf.js dependency.
 */
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

/** [west, south, east, north] over the points, or null when empty. */
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

export function TurfMap({ voterPoints = [] }: { voterPoints?: VoterPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const didFitRef = useRef(false);

  const [saved, setSaved] = useState<SavedTurf[]>([]);
  const [styleUrl, setStyleUrl] = useState<string>(STYLES[0].url);
  const [saving, setSaving] = useState(false);

  // ── Filter bar state — "the filtered list drives the turf" ──────────────────
  const [party, setParty] = useState<Record<Party, boolean>>({ D: true, R: true, I: true });
  const [svOn, setSvOn] = useState(false);
  const [svN, setSvN] = useState(3);
  const [svM, setSvM] = useState(MAX_M);
  const [supportMin, setSupportMin] = useState(0); // 0 = any

  // ── Doors-vs-people readout for the most recent drawn polygon ───────────────
  const [counts, setCounts] = useState<{ people: number; doors: number } | null>(null);
  const [countMode, setCountMode] = useState<"people" | "doors">("people");

  // Filtered points, derived during render (no effect) per react-best-practices.
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

  // Latest filtered set for the (once-registered) draw.create handler — avoids a
  // stale closure so counts always reflect the CURRENT filter (advanced-use-latest).
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  const refresh = async () => {
    const turfs = await listTurfs();
    setSaved(turfs);
    const src = mapRef.current?.getSource("saved-turfs") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(turfFeatures(turfs));
  };

  // (Re-)add saved-turf + voter-point sources/layers. Called on first load and on
  // every style.load (a style swap wipes user layers), mirroring the saved-turf flow.
  const addLayers = (map: mapboxgl.Map) => {
    if (!map.getSource("saved-turfs")) {
      map.addSource("saved-turfs", { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: "saved-fill", type: "fill", source: "saved-turfs", paint: { "fill-color": "#a3e635", "fill-opacity": 0.22 } });
      map.addLayer({ id: "saved-outline", type: "line", source: "saved-turfs", paint: { "line-color": "#4d7c0f", "line-width": 2 } });
    }
    if (!map.getSource("voter-points")) {
      map.addSource("voter-points", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "voter-circles",
        type: "circle",
        source: "voter-points",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.4, 13, 4.5, 16, 7],
          "circle-color": ["match", ["get", "party"], "D", PARTY_COLOR.D, "R", PARTY_COLOR.R, PARTY_COLOR.I],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.7,
        },
      });
    }
    // Push current data right away so a style swap repaints both layers.
    (map.getSource("voter-points") as mapboxgl.GeoJSONSource | undefined)?.setData(pointFeatures(filteredRef.current));
    void refresh();
  };

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[0].url,
      center: [-80.2064, 26.1645], // fallback only — fitBounds() moves to real voters on load
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
    drawRef.current = draw;
    map.addControl(draw as unknown as mapboxgl.IControl, "top-left");

    map.on("load", () => addLayers(map));

    // Drawn turf → count filtered voters inside (client-side ray-cast), persist
    // those exact doors/people, then drop the scratch shape (it becomes a saved layer).
    map.on("draw.create", async (e: { features: Array<{ id?: string | number; geometry: { type: string; coordinates: number[][][] } }> }) => {
      const f = e.features?.[0];
      if (!f || f.geometry?.type !== "Polygon") return;
      const ring = f.geometry.coordinates[0] ?? [];

      // Single pass: people = points inside; doors = distinct address inside.
      const addresses = new Set<string>();
      let people = 0;
      for (const p of filteredRef.current) {
        if (!pointInPolygon(p.lng, p.lat, ring)) continue;
        people++;
        addresses.add((p.address ?? p.external_id).trim().toLowerCase());
      }
      const doors = addresses.size;
      setCounts({ people, doors });

      setSaving(true);
      await saveTurf(f.geometry as GeoPolygon, { voterCount: people, doorCount: doors });
      if (f.id != null) draw.delete(String(f.id));
      await refresh();
      setSaving(false);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      didFitRef.current = false;
    };
  }, []);

  // Keep the circle layer in sync with the filter, and fit to the points: once on
  // first load, then again whenever a "big" filter (super-voter / support floor)
  // changes the visible set materially. Guard empty so we never fitBounds([]).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("voter-points") as mapboxgl.GeoJSONSource | undefined)?.setData(pointFeatures(filtered));
      const b = pointsBounds(filtered);
      if (b) {
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 64, maxZoom: 15, duration: didFitRef.current ? 600 : 0 });
        didFitRef.current = true;
      }
    };
    if (map.isStyleLoaded() && map.getSource("voter-points")) apply();
    else map.once("idle", apply);
    // Refit only on load + on the "big" filters (not on every party toggle), per spec.
  }, [filtered, svOn, svN, svM, supportMin]);

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
  const setM = (next: number) => {
    const mm = Math.max(2, Math.min(MAX_M, next));
    setSvM(mm);
    setSvN((n) => Math.min(n, mm)); // keep N ≤ M
  };
  const setN = (next: number) => setSvN(Math.max(1, Math.min(svM, next)));

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* ── Filter bar — the filtered list drives the turf ──────────────────── */}
      <div
        style={{
          position: "absolute", top: 14, left: 52, zIndex: 3, display: "flex", flexDirection: "column", gap: 8,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 10,
          boxShadow: "var(--shadow-card)", width: 226, fontSize: 12,
        }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Filter doors</span>
          <span className="mono muted" style={{ fontSize: 11 }}>{filtered.length}/{voterPoints.length}</span>
        </div>

        <div className="row" style={{ gap: 4 }}>
          {(["D", "R", "I"] as Party[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => togglePartyKey(k)}
              style={{
                flex: 1, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                border: `1px solid ${party[k] ? PARTY_COLOR[k] : "var(--border)"}`,
                background: party[k] ? PARTY_COLOR[k] : "transparent",
                color: party[k] ? "#fff" : "var(--ink-2)",
              }}
            >
              {k}
            </button>
          ))}
        </div>

        <label className="row" style={{ gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={svOn} onChange={(e) => setSvOn(e.target.checked)} />
          <span>Super voters only</span>
        </label>
        <div className="row" style={{ gap: 6, opacity: svOn ? 1 : 0.45, pointerEvents: svOn ? "auto" : "none" }}>
          <span className="muted">≥</span>
          <Stepper value={svN} min={1} max={svM} onChange={setN} />
          <span className="muted">of last</span>
          <Stepper value={svM} min={2} max={MAX_M} onChange={setM} />
        </div>

        <label className="row" style={{ gap: 6, justifyContent: "space-between" }}>
          <span>Support ≥</span>
          <select
            value={supportMin}
            onChange={(e) => setSupportMin(Number(e.target.value))}
            style={{ height: 24, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 11.5, padding: "0 4px" }}
          >
            <option value={0}>Any</option>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>{v}+</option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Style switcher (unchanged) ──────────────────────────────────────── */}
      <div style={{ position: "absolute", top: 14, right: 14, zIndex: 2, display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 2, boxShadow: "var(--shadow-card)" }}>
        {STYLES.map((s) => (
          <button
            key={s.url}
            type="button"
            onClick={() => switchStyle(s.url)}
            style={{
              height: 26, padding: "0 9px", border: 0, borderRadius: 6, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
              background: styleUrl === s.url ? "var(--ink)" : "transparent",
              color: styleUrl === s.url ? "var(--bg)" : "var(--ink-2)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Legend: doors-vs-people for the last drawn turf + status ────────── */}
      <div className="map-legend">
        {counts ? (
          <>
            <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
              <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>
                {(countMode === "people" ? counts.people : counts.doors).toLocaleString()}
              </span>
              <span className="muted" style={{ fontSize: 11.5 }}>{countMode === "people" ? "people" : "doors"} in turf</span>
            </div>
            <div className="row" style={{ gap: 2, marginTop: 4, background: "var(--surface-3)", borderRadius: 6, padding: 2, width: "fit-content" }}>
              {(["doors", "people"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCountMode(m)}
                  style={{
                    height: 22, padding: "0 8px", border: 0, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: countMode === m ? "var(--ink)" : "transparent",
                    color: countMode === m ? "var(--bg)" : "var(--ink-2)",
                  }}
                >
                  {m === "doors" ? `${counts.doors} doors` : `${counts.people} people`}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="row" style={{ gap: 6, fontWeight: 500 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, border: "2px solid var(--accent)", background: "color-mix(in oklch, var(--accent) 25%, transparent)" }} />
            Cut a turf — polygon tool, top-left
          </div>
        )}
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          {saving ? "Saving…" : `${saved.length} turf${saved.length === 1 ? "" : "s"} saved · ${filtered.length} doors shown`}
        </div>
      </div>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span className="row" style={{ gap: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      <button type="button" aria-label="decrease" disabled={value <= min} onClick={() => onChange(value - 1)}
        style={{ width: 22, height: 24, border: 0, background: "transparent", cursor: value <= min ? "default" : "pointer", color: "var(--ink-2)", fontWeight: 700, opacity: value <= min ? 0.4 : 1 }}>−</button>
      <span className="mono" style={{ minWidth: 18, textAlign: "center", fontWeight: 600 }}>{value}</span>
      <button type="button" aria-label="increase" disabled={value >= max} onClick={() => onChange(value + 1)}
        style={{ width: 22, height: 24, border: 0, background: "transparent", cursor: value >= max ? "default" : "pointer", color: "var(--ink-2)", fontWeight: 700, opacity: value >= max ? 0.4 : 1 }}>+</button>
    </span>
  );
}
