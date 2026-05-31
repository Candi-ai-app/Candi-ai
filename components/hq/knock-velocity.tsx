"use client";

import { useMemo, useState } from "react";

// Live "Knock velocity" chart. The page computes three per-day series over the
// last 14 days and passes them in; the Doors / Contacts / Support tags toggle
// which series renders. Default metric = these three; swappable later.
type Metric = "doors" | "contacts" | "support";

const METRICS: { k: Metric; label: string; tag: string }[] = [
  { k: "doors", label: "Doors", tag: "accent" },
  { k: "contacts", label: "Contacts", tag: "indigo" },
  { k: "support", label: "Support", tag: "" },
];

// chart geometry (matches the prior mock's proportions)
const CW = 620;
const CH = 150;
const PAD = 12;

export function KnockVelocity({
  days,
  doors,
  contacts,
  support,
}: {
  days: string[];
  doors: number[];
  contacts: number[];
  support: number[];
}) {
  const [metric, setMetric] = useState<Metric>("doors");

  const series = metric === "doors" ? doors : metric === "contacts" ? contacts : support;

  const { bars, line, area, peak } = useMemo(() => {
    const n = Math.max(series.length, 1);
    const step = n > 1 ? (CW - PAD * 2) / (n - 1) : 0;
    // Scale to the tallest value across ALL series so toggling keeps a stable
    // y-axis (a metric never looks bigger just because its own max is smaller).
    const peakVal = Math.max(1, ...doors, ...contacts, ...support);
    const usable = CH - 24;
    const pts = series.map((v, i) => [PAD + i * step, CH - (v / peakVal) * usable] as const);
    const lineD = pts
      .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");
    const areaD = pts.length
      ? `${lineD} L${(PAD + (n - 1) * step).toFixed(1)},${CH} L${PAD},${CH} Z`
      : "";
    const barEls = series.map((v, i) => {
      const h = (v / peakVal) * usable;
      return { x: PAD + i * step - 5, y: CH - h, h };
    });
    return { bars: barEls, line: lineD, area: areaD, peak: peakVal };
  }, [series, doors, contacts, support]);

  const total = series.reduce((a, b) => a + b, 0);

  return (
    <div className="card hq-trend">
      <div className="card-head">
        <h3>Knock velocity</h3>
        <span className="sub">· last 14 days</span>
        <div className="acts" role="tablist" aria-label="Chart metric">
          {METRICS.map((m) => (
            <button
              key={m.k}
              type="button"
              role="tab"
              aria-selected={metric === m.k}
              onClick={() => setMetric(m.k)}
              className={`tag${m.tag ? ` ${m.tag}` : ""}`}
              style={{
                cursor: "pointer",
                border: "none",
                opacity: metric === m.k ? 1 : 0.4,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        {total === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, padding: "32px 0", textAlign: "center" }}>
            No {metric} logged in the last 14 days yet.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${CW} ${CH}`}
            style={{ width: "100%", height: 200, display: "block" }}
            aria-label={`${metric} per day, peak ${peak}`}
          >
            {bars.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={10}
                height={Math.max(b.h, 0)}
                rx={2}
                fill="var(--ink)"
                opacity={0.85}
              >
                <title>
                  {days[i]}: {series[i]}
                </title>
              </rect>
            ))}
            <path d={area} fill="var(--accent)" opacity={0.18} />
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} />
          </svg>
        )}
      </div>
    </div>
  );
}
