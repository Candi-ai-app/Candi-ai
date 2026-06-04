"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, MessageSquare, Navigation } from "lucide-react";
import type { FieldTurf, FieldStop } from "@/app/(app)/field/actions";
import { logDoorContact } from "@/app/(app)/field/actions";
import type { RouteStop } from "@/app/(app)/canvassing/actions";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// ── Distance helpers (step-by-step guidance) ──────────────────────────────────
function haversineMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function fmtDistance(m: number): string {
  const ft = m * 3.28084;
  if (ft < 1000) return `${Math.round(ft / 10) * 10} ft`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}
const PARTY_LABEL: Record<string, string> = { D: "Dem", R: "Rep", I: "Ind" };

// ── Types ─────────────────────────────────────────────────────────────────────
type ResultType = "not_home" | "supporter" | "refused" | "moved" | null;

const RESULT_LABELS: Record<NonNullable<ResultType>, string> = {
  not_home: "Not home",
  supporter: "Supporter",
  refused: "Refused",
  moved: "Moved",
};

// ── Turf Picker ───────────────────────────────────────────────────────────────
function TurfPicker({
  turfs,
  onSelect,
}: {
  turfs: FieldTurf[];
  onSelect: (turf: FieldTurf) => void;
}) {
  if (turfs.length === 0) {
    return (
      <div className="field-empty">
        <div className="field-empty-ico">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <b>No turfs assigned</b>
        <span>Ask your campaign director to assign and generate a route for your turf.</span>
      </div>
    );
  }

  return (
    <div className="field-picker">
      <div className="field-picker-head">
        <h2>Your Turfs</h2>
        <span className="muted">{turfs.length} assigned</span>
      </div>
      <div className="field-picker-list">
        {turfs.map((turf) => (
          <button
            key={turf.id}
            className="field-turf-card"
            onClick={() => onSelect(turf)}
          >
            <div className="field-turf-card-top">
              <span className="field-turf-name">{turf.name}</span>
              <span className={"tag " + statusClass(turf.status)}>
                {turf.status}
              </span>
            </div>
            <div className="field-turf-meta">
              <span>{turf.doorCount} doors</span>
              <span className="muted">·</span>
              <span>{turf.route.length} stops</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function statusClass(status: string): string {
  if (status === "active") return "accent";
  if (status === "complete") return "teal";
  return "ind";
}

// ── Walk Map (Mapbox, client-only) ───────────────────────────────────────────
function WalkMap({
  route,
  currentStopIndex,
  doneAddresses,
}: {
  route: RouteStop[];
  currentStopIndex: number;
  doneAddresses: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpsDotRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!TOKEN || !containerRef.current || mapRef.current) return;

    // Dynamic import to avoid SSR issues
    import("mapbox-gl").then((mod) => {
      const mapboxgl = mod.default;
      import("mapbox-gl/dist/mapbox-gl.css");

      mapboxgl.accessToken = TOKEN;

      const currentStop = route[currentStopIndex] ?? route[0];
      const center: [number, number] = currentStop
        ? [currentStop.lng, currentStop.lat]
        : [-80.2064, 26.1645];

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/dark-v11",
        center,
        zoom: 15,
        attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        // Fix blank map from dynamic import layout timing
        map.resize();

        // Route line
        map.addSource("field-route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features:
              route.length >= 2
                ? [
                    {
                      type: "Feature",
                      geometry: {
                        type: "LineString",
                        coordinates: route.map((s) => [s.lng, s.lat]),
                      },
                      properties: {},
                    },
                  ]
                : [],
          },
        });
        map.addLayer({
          id: "field-route-layer",
          type: "line",
          source: "field-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#1d4ed8",
            "line-width": 2.5,
            "line-dasharray": [2, 1.4],
            "line-opacity": 0.9,
          },
        });

        // Done stops (gray)
        map.addSource("field-done", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "field-done-layer",
          type: "circle",
          source: "field-done",
          paint: { "circle-radius": 5, "circle-color": "#64748b", "circle-opacity": 0.7 },
        });

        // Current stop (green)
        map.addSource("field-current", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "field-current-layer",
          type: "circle",
          source: "field-current",
          paint: { "circle-radius": 9, "circle-color": "#22c55e", "circle-opacity": 1, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
        });
        currentMarkerRef.current = "ready";

        updateStopLayers(map, route, currentStopIndex, doneAddresses);

        // GPS dot using a pulsing marker
        const el = document.createElement("div");
        el.className = "field-gps-dot";
        el.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.3)";
        const gpsMarker = new mapboxgl.Marker({ element: el });
        gpsDotRef.current = gpsMarker;

        if (typeof navigator !== "undefined" && navigator.geolocation) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              const { longitude, latitude } = pos.coords;
              gpsMarker.setLngLat([longitude, latitude]).addTo(map);
            },
            () => {
              // GPS unavailable — silently ignore, dot just won't show
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
          );
        }
      });

      return () => {
        if (watchIdRef.current !== null && typeof navigator !== "undefined") {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        map.remove();
        mapRef.current = null;
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update current stop highlight whenever currentStopIndex or doneAddresses changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    updateStopLayers(map, route, currentStopIndex, doneAddresses);
  }, [route, currentStopIndex, doneAddresses]);

  return (
    <div className="field-map">
      {!TOKEN && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-2)",
            color: "var(--muted)",
            fontSize: 13,
            padding: 24,
            textAlign: "center",
          }}
        >
          Map unavailable: NEXT_PUBLIC_MAPBOX_TOKEN is not set.
        </div>
      )}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

function updateStopLayers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  route: RouteStop[],
  currentIdx: number,
  doneAddresses: Set<string>
) {
  const doneFeatures = route
    .filter((s) => doneAddresses.has(s.address))
    .map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: {},
    }));

  const currentStop = route[currentIdx];
  const currentFeature = currentStop
    ? [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [currentStop.lng, currentStop.lat] },
          properties: {},
        },
      ]
    : [];

  try {
    const doneSource = map.getSource("field-done");
    if (doneSource) doneSource.setData({ type: "FeatureCollection", features: doneFeatures });

    const currentSource = map.getSource("field-current");
    if (currentSource)
      currentSource.setData({ type: "FeatureCollection", features: currentFeature });

    if (currentStop) {
      map.easeTo({ center: [currentStop.lng, currentStop.lat], duration: 500 });
    }
  } catch {
    // Map not ready yet — will retry on next effect run
  }
}

// ── Voter contact card (attached to a stop) ──────────────────────────────────
function StopVoterCard({ stop }: { stop: FieldStop }) {
  const v = stop.voter;
  if (!v) {
    return (
      <div className="field-voter-card field-voter-card-empty">
        <span className="muted">No registered voter matched to this address.</span>
      </div>
    );
  }
  const tel = v.phone ? v.phone.replace(/[^\d+]/g, "") : "";
  return (
    <div className="field-voter-card">
      <div className="field-voter-top">
        <span className="field-voter-name">{v.name}</span>
        {v.party && <span className={"tag party-" + v.party.toLowerCase()}>{PARTY_LABEL[v.party] ?? v.party}</span>}
        {stop.othersAtAddress > 0 && (
          <span className="muted field-voter-others">+{stop.othersAtAddress} at address</span>
        )}
      </div>
      <div className="field-voter-meta">
        <span className="field-voter-support">
          Support:{" "}
          <b>{v.support != null && v.support > 0 ? `${v.support}/5` : "—"}</b>
        </span>
        {tel ? (
          <span className="field-voter-contacts">
            <a className="field-voter-link" href={`tel:${tel}`}><Phone style={{ width: 12, height: 12 }} /> Call</a>
            <a className="field-voter-link" href={`sms:${tel}`}><MessageSquare style={{ width: 12, height: 12 }} /> Text</a>
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 11 }}>No phone on file</span>
        )}
      </div>
    </div>
  );
}

// ── Result Card (inline for selected stop) ───────────────────────────────────
function ResultCard({
  stop,
  onLog,
  loading,
}: {
  stop: FieldStop;
  onLog: (result: string, support: number | null, notes: string) => void;
  loading: boolean;
}) {
  const [resultType, setResultType] = useState<ResultType>(null);
  const [support, setSupport] = useState<number | null>(stop.voter?.support ?? null);
  const [notes, setNotes] = useState("");

  const handleLog = () => {
    if (!resultType) return;
    onLog(RESULT_LABELS[resultType], resultType === "supporter" ? support : null, notes);
    setResultType(null);
    setSupport(stop.voter?.support ?? null);
    setNotes("");
  };

  return (
    <div className="field-result-card">
      <StopVoterCard stop={stop} />
      <div className="field-btn-row">
        {(["not_home", "supporter", "refused", "moved"] as ResultType[]).map((r) => (
          <button
            key={r!}
            className={"field-result-btn" + (resultType === r ? " active" : "")}
            onClick={() => {
              setResultType(r);
              if (r !== "supporter") setSupport(null);
            }}
          >
            {RESULT_LABELS[r!]}
          </button>
        ))}
      </div>

      {resultType === "supporter" && (
        <div className="field-support-row">
          <span className="field-support-lbl">Support 1–5:</span>
          <div className="field-support-btns">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={"field-score-btn" + (support === n ? " active" : "")}
                onClick={() => setSupport(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        className="field-notes"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={1}
      />

      <button
        className="btn primary"
        style={{ width: "100%", justifyContent: "center" }}
        disabled={!resultType || loading}
        onClick={handleLog}
      >
        {loading ? "Saving…" : "Log door"}
      </button>
    </div>
  );
}

// ── Walk View (map + panel) ───────────────────────────────────────────────────
function WalkView({
  turf,
  onDone,
}: {
  turf: FieldTurf;
  onDone: () => void;
}) {
  const stops = turf.stops;
  const [doneAddresses, setDoneAddresses] = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleLog = useCallback(
    async (result: string, support: number | null, notes: string) => {
      const stop = stops[currentIdx];
      if (!stop) return;

      setSaving(true);
      await logDoorContact({
        turfId: turf.id,
        stopAddress: stop.address,
        voterId: stop.voter?.voterId ?? null,
        result,
        support,
        notes,
      });
      setSaving(false);

      setDoneAddresses((prev) => {
        const next = new Set(prev);
        next.add(stop.address);
        return next;
      });

      const nextIdx = findNextUndone(stops, currentIdx, doneAddresses, stop.address);
      if (nextIdx !== null) setCurrentIdx(nextIdx);
    },
    [stops, currentIdx, doneAddresses, turf.id]
  );

  const doneCount = doneAddresses.size;
  const totalCount = stops.length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;

  // Step-by-step guidance: distance from the current stop to the next one.
  const current = stops[currentIdx];
  const next = stops[currentIdx + 1] ?? null;
  const distToNext = current && next ? haversineMeters(current, next) : null;

  return (
    <div className="field-wrap">
      <WalkMap
        route={turf.route}
        currentStopIndex={currentIdx}
        doneAddresses={doneAddresses}
      />

      <div className="field-panel">
        {/* Header + progress */}
        <div className="field-panel-head">
          <div className="field-panel-title">
            <b>{turf.name}</b>
            <span className="muted" style={{ fontSize: 12 }}>
              {doneCount} / {totalCount} doors
            </span>
          </div>
          <div className="field-progress">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          {/* Step-by-step instruction line */}
          {current && (
            <div className="field-step-guide">
              <Navigation style={{ width: 13, height: 13, color: "var(--accent-deep)" }} />
              <span>
                <b>Stop {currentIdx + 1} of {totalCount}</b> · {current.address}
                {next && distToNext != null && (
                  <> · then <b>{fmtDistance(distToNext)}</b> to {next.address}</>
                )}
                {!next && <> · last stop on this route</>}
              </span>
            </div>
          )}
        </div>

        {/* Stop list */}
        <div className="field-stop-list">
          {stops.map((stop, idx) => {
            const isDone = doneAddresses.has(stop.address);
            const isCurrent = idx === currentIdx && !isDone;
            const statusChip = isDone ? "done" : isCurrent ? "current" : "upcoming";
            const prev = stops[idx - 1] ?? null;
            const legDist = prev ? haversineMeters(prev, stop) : null;

            return (
              <div key={stop.address + idx} className={"field-stop-row" + (isCurrent ? " current" : "")}>
                <div className="field-stop-num">{idx + 1}</div>
                <div className="field-stop-info">
                  <button
                    className="field-stop-addr"
                    onClick={() => {
                      if (!isDone) setCurrentIdx(idx);
                    }}
                    disabled={isDone}
                  >
                    {stop.address}
                    {stop.voter && <span className="field-stop-voter">{stop.voter.name}</span>}
                  </button>
                  <span className={"tag field-stop-chip " + (isDone ? "teal" : isCurrent ? "accent" : "und")}>
                    {statusChip}
                  </span>
                </div>
                {legDist != null && !isCurrent && (
                  <div className="field-stop-leg muted">{fmtDistance(legDist)} walk</div>
                )}

                {isCurrent && (
                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <ResultCard stop={stop} onLog={handleLog} loading={saving} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Done button */}
        <div style={{ padding: "12px 16px 20px" }}>
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={onDone}>
            Done with turf
          </button>
        </div>
      </div>
    </div>
  );
}

function findNextUndone(
  route: { address: string }[],
  currentIdx: number,
  doneAddresses: Set<string>,
  justDone: string
): number | null {
  // Try to advance from currentIdx+1
  for (let i = currentIdx + 1; i < route.length; i++) {
    if (!doneAddresses.has(route[i].address) && route[i].address !== justDone) return i;
  }
  // Wrap to find any undone stop from the beginning
  for (let i = 0; i < currentIdx; i++) {
    if (!doneAddresses.has(route[i].address) && route[i].address !== justDone) return i;
  }
  return null;
}

// ── Main exported component ───────────────────────────────────────────────────
export function FieldView({ turfs }: { turfs: FieldTurf[] }) {
  const [selectedTurf, setSelectedTurf] = useState<FieldTurf | null>(null);

  if (selectedTurf) {
    return (
      <WalkView
        turf={selectedTurf}
        onDone={() => setSelectedTurf(null)}
      />
    );
  }

  // Auto-select if only one turf
  if (turfs.length === 1 && !selectedTurf) {
    // Intentional: show picker first so user can tap in — don't auto-redirect
  }

  return <TurfPicker turfs={turfs} onSelect={setSelectedTurf} />;
}
