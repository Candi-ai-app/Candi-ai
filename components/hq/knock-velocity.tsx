"use client";

import { useMemo, useState } from "react";

type SeriesKey = "doors" | "contacts" | "support";

const SERIES: { label: string; key: SeriesKey; color: string }[] = [
  { label: "Doors", key: "doors", color: "var(--accent)" },
  { label: "Contacts", key: "contacts", color: "var(--indigo)" },
  { label: "Support", key: "support", color: "var(--teal)" },
];

type RangeKey = "today" | "7d" | "14d" | "30d" | "all";

const RANGES: { label: string; key: RangeKey; days: number | null }[] = [
  { label: "Today", key: "today", days: 1 },
  { label: "7d", key: "7d", days: 7 },
  { label: "14d", key: "14d", days: 14 },
  { label: "30d", key: "30d", days: 30 },
  { label: "All time", key: "all", days: null },
];

/** Raw contact row — bucketed client-side per selected range. */
export type ContactPoint = {
  created_at: string;
  channel: string | null;
  result: string | null;
  support: number | null;
};

const DAY_MS = 86_400_000;
const WEEK_BUCKET_THRESHOLD_DAYS = 45; // span beyond this → bucket "All time" by week

const CW = 640;
const CH = 176;
const PAD = 14;
const TOP = 16; // headroom above tallest bar
const BOT = 20; // room for day labels
const PLOT = CH - TOP - BOT;

const NO_CONTACT_RESULTS = new Set(["not-home", "lit-dropped"]);
function isSupport(r: ContactPoint): boolean {
  return r.result === "supporter" || (r.support ?? 0) >= 4;
}
function isReached(r: ContactPoint): boolean {
  return !NO_CONTACT_RESULTS.has(r.result ?? "");
}

/** Local YYYY-MM-DD key for a date. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

type Bucket = {
  label: string; // axis tick label
  full: string; // tooltip label
  doors: number;
  contacts: number;
  support: number;
};

/**
 * Bucket the raw rows for the active range:
 *  - today: a single bucket for the current day
 *  - 7/14/30d: one bucket per day, today inclusive
 *  - all: per-day, but switch to per-week if the data span exceeds ~45 days
 */
function bucketize(rows: ContactPoint[], range: RangeKey): Bucket[] {
  const now = new Date();
  const today = startOfDay(now);

  if (range === "today") {
    const k = dayKey(now);
    const b: Bucket = {
      label: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      full: "Today",
      doors: 0,
      contacts: 0,
      support: 0,
    };
    for (const r of rows) {
      if (dayKey(new Date(r.created_at)) !== k) continue;
      tally(b, r);
    }
    return [b];
  }

  if (range !== "all") {
    const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
    const buckets: Bucket[] = [];
    const idx = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      idx.set(dayKey(d), buckets.length);
      buckets.push({
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        full: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        doors: 0,
        contacts: 0,
        support: 0,
      });
    }
    for (const r of rows) {
      const i = idx.get(dayKey(new Date(r.created_at)));
      if (i === undefined) continue;
      tally(buckets[i], r);
    }
    return buckets;
  }

  // ── All time ────────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return [{ label: "", full: "", doors: 0, contacts: 0, support: 0 }];
  }
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const spanDays = Math.max(1, Math.ceil((max - min) / DAY_MS) + 1);

  if (spanDays <= WEEK_BUCKET_THRESHOLD_DAYS) {
    const first = startOfDay(new Date(min));
    const buckets: Bucket[] = [];
    const idx = new Map<string, number>();
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(first.getTime() + i * DAY_MS);
      idx.set(dayKey(d), buckets.length);
      buckets.push({
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        full: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        doors: 0,
        contacts: 0,
        support: 0,
      });
    }
    for (const r of rows) {
      const i = idx.get(dayKey(new Date(r.created_at)));
      if (i === undefined) continue;
      tally(buckets[i], r);
    }
    return buckets;
  }

  // Span too wide — bucket by week (Monday-anchored) to avoid clutter.
  function weekStart(d: Date): Date {
    const x = startOfDay(d);
    const dow = (x.getDay() + 6) % 7; // 0 = Monday
    return new Date(x.getTime() - dow * DAY_MS);
  }
  const firstWeek = weekStart(new Date(min));
  const lastWeek = weekStart(new Date(max));
  const weeks = Math.floor((lastWeek.getTime() - firstWeek.getTime()) / (7 * DAY_MS)) + 1;
  const buckets: Bucket[] = [];
  const idx = new Map<string, number>();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(firstWeek.getTime() + i * 7 * DAY_MS);
    idx.set(dayKey(d), buckets.length);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    buckets.push({ label, full: `Week of ${label}`, doors: 0, contacts: 0, support: 0 });
  }
  for (const r of rows) {
    const i = idx.get(dayKey(weekStart(new Date(r.created_at))));
    if (i === undefined) continue;
    tally(buckets[i], r);
  }
  return buckets;
}

function tally(b: Bucket, r: ContactPoint) {
  if (isReached(r)) b.contacts++;
  if (r.channel === "door") b.doors++;
  if (isSupport(r)) b.support++;
}

export function KnockVelocity({ rows }: { rows: ContactPoint[] }) {
  const [active, setActive] = useState<SeriesKey>("doors");
  const [range, setRange] = useState<RangeKey>("14d");
  const [hover, setHover] = useState<number | null>(null);

  const buckets = useMemo(() => bucketize(rows, range), [rows, range]);

  const s = SERIES.find((x) => x.key === active)!;
  const rangeMeta = RANGES.find((r) => r.key === range)!;
  const data = buckets.map((b) => b[active]);
  const labels = buckets.map((b) => b.label);
  const fulls = buckets.map((b) => b.full);

  const max = Math.max(1, ...data);
  const n = data.length;
  const step = n > 1 ? (CW - PAD * 2) / (n - 1) : 0;
  const x = (i: number) => (n > 1 ? PAD + i * step : CW / 2);
  const y = (v: number) => TOP + PLOT - (v / max) * PLOT;
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = pts.length
    ? `${line} L${x(n - 1).toFixed(1)},${TOP + PLOT} L${x(0).toFixed(1)},${TOP + PLOT} Z`
    : "";
  const total = data.reduce((a, b) => a + b, 0);
  const empty = data.every((v) => v === 0);

  // Subtitle reflects the active range (no longer a hardcoded "last 14 days").
  const rangeLabel =
    range === "today" ? "today" : range === "all" ? "all time" : `last ${rangeMeta.days} days`;
  // Show every label when sparse; thin out when dense to avoid overlap.
  const labelEvery = n <= 8 ? 1 : Math.ceil(n / 8);

  return (
    <div className="card hq-trend">
      <div className="card-head">
        <h3>Knock velocity</h3>
        <span className="sub">· {rangeLabel}</span>
        <div className="acts" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="hq-trend-ctl">
            {RANGES.map((it) => (
              <button
                key={it.key}
                type="button"
                className={"tag" + (range === it.key ? " accent" : "")}
                onClick={() => {
                  setRange(it.key);
                  setHover(null);
                }}
                style={{ cursor: "pointer", border: 0 }}
              >
                {it.label}
              </button>
            ))}
          </div>
          <div className="hq-trend-ctl">
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
      </div>
      <div className="card-body">
        {empty ? (
          <div className="muted" style={{ padding: "48px 0", textAlign: "center", fontSize: 13 }}>
            No {active} recorded for {rangeLabel} yet.
          </div>
        ) : (
          <>
            <div className="hq-trend-meta">
              <span>
                <b>{total.toLocaleString()}</b> {s.label.toLowerCase()} · {rangeLabel}
              </span>
              <span className="muted mono">
                peak {max.toLocaleString()}/{range === "all" && n > 0 && fulls[0]?.startsWith("Week") ? "wk" : "day"}
              </span>
            </div>
            <svg
              viewBox={`0 0 ${CW} ${CH}`}
              style={{ width: "100%", height: 196, display: "block" }}
              role="img"
              aria-label={`${s.label} per period over ${rangeLabel}`}
            >
              <line
                x1={PAD}
                y1={TOP + PLOT}
                x2={CW - PAD}
                y2={TOP + PLOT}
                stroke="var(--hairline)"
                strokeWidth={1}
              />

              {data.map((v, i) => {
                const h = (v / max) * PLOT;
                const on = hover === i;
                // Bar width scales down as buckets grow dense.
                const bw = Math.max(4, Math.min(12, step > 0 ? step * 0.55 : 12));
                return (
                  <rect
                    key={i}
                    x={x(i) - bw / 2}
                    y={TOP + PLOT - h}
                    width={bw}
                    height={Math.max(h, 0.5)}
                    rx={2}
                    fill={s.color}
                    opacity={on ? 0.5 : 0.18}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${fulls[i]}: ${v.toLocaleString()} ${s.label.toLowerCase()}`}</title>
                  </rect>
                );
              })}

              <path d={area} fill={s.color} opacity={0.12} />
              <path
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {hover !== null && (
                <>
                  <circle
                    cx={x(hover)}
                    cy={y(data[hover])}
                    r={3.5}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
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

              {labels.map((d, i) =>
                i % labelEvery === 0 || i === n - 1 ? (
                  <text
                    key={i}
                    x={x(i)}
                    y={CH - 5}
                    textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}
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
