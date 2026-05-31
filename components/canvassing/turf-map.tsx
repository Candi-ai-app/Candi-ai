"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Rough polygon area in acres (shoelace on lng/lat → m² → acres). Good enough for a turf readout.
function areaAcres(coords: number[][]): number {
  if (coords.length < 3) return 0;
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[(i + 1) % coords.length];
    area += ((lng2 - lng1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  area = Math.abs((area * R * R) / 2);
  return area / 4046.86;
}

export function TurfMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [turfCount, setTurfCount] = useState(0);
  const [lastAcres, setLastAcres] = useState<number | null>(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-79.934, 40.456], // Pittsburgh East End (matches mock precincts)
      zoom: 12.4,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    // @types lag behind mapbox-gl v3's IControl signature
    map.addControl(draw as unknown as mapboxgl.IControl, "top-left");

    const recalc = () => {
      const fc = draw.getAll();
      setTurfCount(fc.features.length);
      const last = fc.features[fc.features.length - 1];
      if (last && last.geometry.type === "Polygon") {
        setLastAcres(areaAcres(last.geometry.coordinates[0] as number[][]));
      }
    };
    map.on("draw.create", recalc);
    map.on("draw.update", recalc);
    map.on("draw.delete", recalc);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      <div className="map-legend">
        <div className="row" style={{ gap: 6, fontWeight: 500 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, border: "2px solid var(--accent)", background: "color-mix(in oklch, var(--accent) 25%, transparent)" }} />
          Cut a turf — polygon tool, top-left
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {turfCount} turf{turfCount === 1 ? "" : "s"} drawn
          {lastAcres != null && turfCount > 0 ? ` · last ≈ ${lastAcres.toFixed(1)} acres` : ""}
        </div>
      </div>
    </div>
  );
}
