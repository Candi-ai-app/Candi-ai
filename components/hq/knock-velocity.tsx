"use client";

import { useState } from "react";

type SeriesKey = "doors" | "contacts" | "support";

const SERIES: { label: string; key: SeriesKey; color: string }[] = [
  { label: "Doors", key: "doors", color: "var(--accent)" },
  { label: "Contacts", key: "contacts", color: "var(--indigo)" },
  { label: "Support", key: "support", color: "var(--teal)" },
];

const CW = 640;
const CH = 176;
const PAD = 14;
const TOP = 16; // headroom above tallest bar
const BOT = 20; // room for day labels
const PLOT = CH - TOP - BOT;

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
  const [active, setActive] = useState<SeriesKey>("doors");
  const [hover, setHover] = useState<number | null>(null);

  const data = active === "doors" ? doors : active === "contacts" ? contacts : support;
  const s = SERIES.find((x) => x.key === active)!;
  const max = Math.max(1, ...data);
  const n = data.length;
  const step = n > 1 ? (CW - PAD * 2) / (n - 1) : 0;
  const x = (i: number) => PAD + i * step;
  const y = (v: number) => TOP + PLOT - (v / max) * PLOT;
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${x(n - 1).toFixed(1)},${TOP + PLOT} L${PAD},${TOP + PLOT} Z` : "";
  const total = data.reduce((a, b) => a + b, 0);
  const empty = data.every((v) => v === 0);

  return (
    <div className="card hq-trend">
      <div className="card-head">
        <h3>Knock velocity</h3>
        <span className="sub">· last 14 days</span>
        <div className="acts">
          {SERIES.map((it) => (
            <button
              key={it.key}
              type="button"
              className={"tag" + (active === it.key ? " accent" : "")}
              onClick={() => setActive(it.key)}
              style={{ cursor: "pointer", border: 0 }}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        {empty ? (
          <div className="muted" style={{ padding: "48px 0", textAlign: "center", fontSize: 13 }}>
            No {active} recorded in the last 14 days yet.
          </div>
        ) : (
          <>
            <div className="hq-trend-meta">
              <span>
                <b>{total.toLocaleString()}</b> {s.label.toLowerCase()} · 14 days
              </span>
              <span className="muted mono">peak {max.toLocaleString()}/day</span>
            </div>
            <svg
              viewBox={`0 0 ${CW} ${CH}`}
              style={{ width: "100%", height: 196, display: "block" }}
              role="img"
              aria-label={`${s.label} per day over the last 14 days`}
            >
              <line x1={PAD} y1={TOP + PLOT} x2={CW - PAD} y2={TOP + PLOT} stroke="var(--hairline)" strokeWidth={1} />

              {data.map((v, i) => {
                const h = (v / max) * PLOT;
                const on = hover === i;
                return (
                  <rect
                    key={i}
                    x={x(i) - 6}
                    y={TOP + PLOT - h}
                    width={12}
                    height={Math.max(h, 0.5)}
                    rx={2}
                    fill={s.color}
                    opacity={on ? 0.5 : 0.18}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${days[i]}: ${v.toLocaleString()} ${s.label.toLowerCase()}`}</title>
                  </rect>
                );
              })}

              <path d={area} fill={s.color} opacity={0.12} />
              <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

              {hover !== null && (
                <>
                  <circle cx={x(hover)} cy={y(data[hover])} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  <text
                    x={Math.min(Math.max(x(hover), 22), CW - 22)}
                    y={y(data[hover]) - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--ink)"
                  >
                    {data[hover].toLocaleString()}
                  </text>
                </>
              )}

              {days.map((d, i) =>
                i % 3 === 0 || i === n - 1 ? (
                  <text
                    key={i}
                    x={x(i)}
                    y={CH - 5}
                    textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                    fontSize={10}
                    fill="var(--mute-2)"
                    fontFamily="var(--f-mono)"
                  >
                    {d}
                  </text>
                ) : null
              )}
            </svg>
          </>
        )}
      </div>
    </div>
  );
}
