"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { saveTurf, listTurfs, type SavedTurf, type GeoPolygon } from "@/app/(app)/canvassing/actions";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const STYLES = [
  { label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
  { label: "Satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { label: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { label: "Dark", url: "mapbox://styles/mapbox/dark-v11" },
  { label: "Outdoors", url: "mapbox://styles/mapbox/outdoors-v12" },
];

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function toFeatures(turfs: SavedTurf[]) {
  return {
    type: "FeatureCollection" as const,
    features: turfs.map((t) => ({ type: "Feature" as const, geometry: t.boundary, properties: { name: t.name } })),
  };
}

export function TurfMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [saved, setSaved] = useState<SavedTurf[]>([]);
  const [styleUrl, setStyleUrl] = useState(STYLES[0].url);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const turfs = await listTurfs();
    setSaved(turfs);
    const src = mapRef.current?.getSource("saved-turfs") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(toFeatures(turfs));
  };

  const addTurfLayers = (map: mapboxgl.Map) => {
    if (!map.getSource("saved-turfs")) {
      map.addSource("saved-turfs", { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: "saved-fill", type: "fill", source: "saved-turfs", paint: { "fill-color": "#a3e635", "fill-opacity": 0.22 } });
      map.addLayer({ id: "saved-outline", type: "line", source: "saved-turfs", paint: { "line-color": "#4d7c0f", "line-width": 2 } });
    }
    void refresh();
  };

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[0].url,
      center: [-80.2064, 26.1645], // Lauderdale Lakes, FL (Broward) — Tekra's district
      zoom: 12.6,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
    drawRef.current = draw;
    map.addControl(draw as unknown as mapboxgl.IControl, "top-left");

    map.on("load", () => addTurfLayers(map));

    // Persist each drawn turf to Supabase, then drop the scratch shape (it's now a saved layer).
    map.on("draw.create", async (e: { features: Array<{ id?: string | number; geometry: { type: string; coordinates: number[][][] } }> }) => {
      const f = e.features?.[0];
      if (!f || f.geometry?.type !== "Polygon") return;
      setSaving(true);
      await saveTurf(f.geometry as GeoPolygon);
      if (f.id != null) draw.delete(String(f.id));
      await refresh();
      setSaving(false);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const switchStyle = (url: string) => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(url);
    map.once("style.load", () => addTurfLayers(map));
    setStyleUrl(url);
  };

  if (!TOKEN) {
    return (
      <div className="map-wrap" style={{ display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13, padding: 24, textAlign: "center" }}>
        Set <code className="mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> in .env.local to load the turf map.
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

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

      <div className="map-legend">
        <div className="row" style={{ gap: 6, fontWeight: 500 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, border: "2px solid var(--accent)", background: "color-mix(in oklch, var(--accent) 25%, transparent)" }} />
          Cut a turf — polygon tool, top-left
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {saving ? "Saving…" : `${saved.length} turf${saved.length === 1 ? "" : "s"} saved`}
        </div>
      </div>
    </div>
  );
}
