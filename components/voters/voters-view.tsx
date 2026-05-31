"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Plus, SlidersHorizontal, Sparkles, Search, Send, Phone, MoreHorizontal,
  X, ChevronDown, MessageSquare, Footprints, Check as CheckIcon, Minus,
} from "lucide-react";
import { VOTERS, CAMPAIGN, type Voter, type Party, partyLabel, partyFull, partyTag } from "@/lib/mock-data";

const ROW_H = 38;

const COLS = [
  { k: "check", w: 34, label: "" },
  { k: "name", w: 172, label: "Name" },
  { k: "addr", w: 188, label: "Address" },
  { k: "precinct", w: 78, label: "Precinct" },
  { k: "party", w: 66, label: "Party" },
  { k: "age", w: 50, label: "Age" },
  { k: "history", w: 112, label: "Vote history" },
  { k: "support", w: 92, label: "Support" },
  { k: "persuasion", w: 110, label: "Persuadability" },
  { k: "last", w: 104, label: "Last contact" },
  { k: "tags", w: 150, label: "Tags" },
  { k: "more", w: 34, label: "" },
] as const;
const TOTAL_W = COLS.reduce((a, c) => a + c.w, 0);

// ── filter definitions (match the campaign walkthrough) ──────────────────────
function turnoutPct(h: string): number {
  const frac = h.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac) { const t = parseInt(frac[2]); return t ? (parseInt(frac[1]) / t) * 100 : 0; }
  const pct = h.match(/(\d+)\s*%/);
  return pct ? parseInt(pct[1]) : 0;
}
function histCats(v: Voter): string[] {
  const cats: string[] = [];
  if (v.flags.includes("new")) cats.push("new");
  if (v.history) cats.push(turnoutPct(v.history) >= 100 ? "perfect" : "skipped");
  return cats;
}
const QUICKS: { k: string; label: string; ai?: boolean; match: (v: Voter) => boolean }[] = [
  { k: "persuadable", label: "Persuadable", match: (v) => v.flags.includes("persuadable") },
  { k: "highlow", label: "High-support · low-turnout", match: (v) => v.support >= 4 && turnoutPct(v.history) < 100 },
  { k: "vbm", label: "VBM outstanding", match: (v) => v.flags.includes("VBM") },
  { k: "never", label: "Never contacted", match: (v) => !v.last || v.last === "—" },
  { k: "tier1", label: "✦ Candi recommends · Tier 1", ai: true, match: (v) => v.persuasion >= 4 },
];
const SUPPORT_DEFS = [
  { v: 1, n: "Strong opp." }, { v: 2, n: "Lean opp." }, { v: 3, n: "Undecided" },
  { v: 4, n: "Lean support" }, { v: 5, n: "Strong supp." },
];
const HIST_DEFS = [
  { k: "perfect", label: "Perfect (4/4)" }, { k: "skipped", label: "Skipped 1+" }, { k: "new", label: "New voters" },
];
const TAG_DEFS = [
  { k: "persuadable", label: "Persuadable", tone: "accent" },
  { k: "volunteer", label: "Volunteer", tone: "indigo" },
  { k: "donor", label: "Donor", tone: "amber" },
  { k: "VBM", label: "VBM requested", tone: "teal" },
  { k: "new", label: "New voter", tone: "" },
];

function toggleSet<T>(set: Set<T>, val: T): Set<T> {
  const n = new Set(set);
  if (n.has(val)) n.delete(val); else n.add(val);
  return n;
}

export function VotersView({ initialVoters }: { initialVoters?: Voter[] }) {
  const ALL = initialVoters && initialVoters.length ? initialVoters : VOTERS;
  const [selected, setSelected] = useState<string | null>(null);
  const [party, setParty] = useState<Record<Party, boolean>>({ D: true, R: true, I: true });
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<string | null>(null);
  const [tagSel, setTagSel] = useState<Set<string>>(new Set());
  const [precSel, setPrecSel] = useState<Set<string>>(new Set());
  const [supportSel, setSupportSel] = useState<Set<number>>(new Set());
  const [histSel, setHistSel] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false); // mobile drawer

  // facet options + counts, derived from the loaded voter set (live or mock)
  const facets = useMemo(() => {
    const partyCounts: Record<Party, number> = { D: 0, R: 0, I: 0 };
    const precinct = new Map<string, number>();
    const tagCounts: Record<string, number> = {};
    const support = [0, 0, 0, 0, 0];
    const hist: Record<string, number> = { perfect: 0, skipped: 0, new: 0 };
    const quickCounts: Record<string, number> = {};
    let contacted = 0;
    for (const v of ALL) {
      partyCounts[v.party] = (partyCounts[v.party] ?? 0) + 1;
      if (v.precinct) precinct.set(v.precinct, (precinct.get(v.precinct) ?? 0) + 1);
      for (const f of v.flags) tagCounts[f] = (tagCounts[f] ?? 0) + 1;
      if (v.support >= 1 && v.support <= 5) support[v.support - 1]++;
      for (const c of histCats(v)) hist[c] = (hist[c] ?? 0) + 1;
      for (const Q of QUICKS) if (Q.match(v)) quickCounts[Q.k] = (quickCounts[Q.k] ?? 0) + 1;
      if (v.last && v.last !== "—") contacted++;
    }
    return {
      partyCounts, tagCounts, support, hist, quickCounts, contacted,
      precinctList: [...precinct.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      total: ALL.length,
    };
  }, [ALL]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeQuick = quick ? QUICKS.find((x) => x.k === quick) : null;
    return ALL.filter((v) => {
      if (!party[v.party]) return false;
      if (precSel.size && !precSel.has(v.precinct)) return false;
      if (supportSel.size && !supportSel.has(v.support)) return false;
      if (tagSel.size && !v.flags.some((f) => tagSel.has(f))) return false;
      if (histSel.size && !histCats(v).some((c) => histSel.has(c))) return false;
      if (activeQuick && !activeQuick.match(v)) return false;
      if (q && !`${v.name} ${v.addr} ${v.precinct} ${v.phone}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ALL, party, precSel, supportSel, tagSel, histSel, quick, search]);

  const sel = useMemo(() => ALL.find((v) => v.id === selected) ?? null, [ALL, selected]);

  const allParties = party.D && party.R && party.I;
  const activeCount =
    (allParties ? 0 : 1) + (quick ? 1 : 0) + tagSel.size + precSel.size + supportSel.size + histSel.size + (search ? 1 : 0);

  const clearAll = () => {
    setParty({ D: true, R: true, I: true });
    setQuick(null);
    setTagSel(new Set());
    setPrecSel(new Set());
    setSupportSel(new Set());
    setHistSel(new Set());
    setSearch("");
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 14,
  });

  return (
    <div className="vot">
      <div className="module-head">
        <div>
          <h1>Voters</h1>
          <div className="sub">
            <span className="mono">{facets.total.toLocaleString()}</span> voters in {CAMPAIGN.district} ·&nbsp;
            <span className="mono">{facets.contacted.toLocaleString()}</span> contacted ·&nbsp;
            <span className="mono">{(facets.tagCounts.VBM ?? 0).toLocaleString()}</span> VBM
          </div>
        </div>
        <div className="acts">
          <button className="btn" type="button"><Plus className="ico" /> Import</button>
          <button className="btn" type="button"><SlidersHorizontal className="ico" /> Saved views</button>
          <button className="btn accent" type="button"><Sparkles className="ico" /> Ask Candi</button>
        </div>
      </div>

      <div className="vot-body">
        {/* mobile backdrop behind the filter drawer */}
        <div className={"filter-backdrop" + (showFilters ? " open" : "")} onClick={() => setShowFilters(false)} />

        {/* ── Filter rail ───────────────────────────────────────────── */}
        <aside className={"filter-rail" + (showFilters ? " open" : "")}>
          <div className="filter-rail-close">
            <span>Filters{activeCount ? ` · ${activeCount}` : ""}</span>
            <X style={{ width: 18, height: 18, cursor: "pointer" }} onClick={() => setShowFilters(false)} />
          </div>

          <div className="filter-search">
            <Search className="ico" style={{ width: 14, height: 14, color: "var(--muted)" }} />
            <input placeholder="Name, address, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {activeCount > 0 && (
              <button type="button" onClick={clearAll} title="Clear filters"
                style={{ border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                Clear
              </button>
            )}
          </div>

          <FilterSection title="Quick filters">
            {QUICKS.map((Q) => (
              <Chip key={Q.k} ai={Q.ai} active={quick === Q.k} onClick={() => setQuick((c) => (c === Q.k ? null : Q.k))}>
                {Q.label} ({(facets.quickCounts[Q.k] ?? 0).toLocaleString()})
              </Chip>
            ))}
          </FilterSection>

          <FilterSection title="Party">
            <Check label="Democrat" count={facets.partyCounts.D.toLocaleString()} checked={party.D} tone="dem" onChange={(v) => setParty((p) => ({ ...p, D: v }))} />
            <Check label="Republican" count={facets.partyCounts.R.toLocaleString()} checked={party.R} tone="rep" onChange={(v) => setParty((p) => ({ ...p, R: v }))} />
            <Check label="Independent / NPA" count={facets.partyCounts.I.toLocaleString()} checked={party.I} tone="ind" onChange={(v) => setParty((p) => ({ ...p, I: v }))} />
          </FilterSection>

          <FilterSection title="Support score">
            <RangeMini defs={SUPPORT_DEFS} counts={facets.support} selected={supportSel} onToggle={(v) => setSupportSel((s) => toggleSet(s, v))} />
          </FilterSection>

          <FilterSection title="Vote history">
            {HIST_DEFS.map((h) => (
              <Check key={h.k} label={h.label} count={(facets.hist[h.k] ?? 0).toLocaleString()} checked={histSel.has(h.k)} onChange={() => setHistSel((s) => toggleSet(s, h.k))} />
            ))}
          </FilterSection>

          <FilterSection title="Tags">
            {TAG_DEFS.map((t) => (
              <Check key={t.k} label={t.label} count={(facets.tagCounts[t.k] ?? 0).toLocaleString()} tone={t.tone} checked={tagSel.has(t.k)} onChange={() => setTagSel((s) => toggleSet(s, t.k))} />
            ))}
          </FilterSection>

          <FilterSection title="Geography">
            {facets.precinctList.length === 0 && <span className="muted" style={{ fontSize: 12, padding: "4px 8px" }}>No precinct data</span>}
            {facets.precinctList.map(([p, c]) => (
              <Check key={p} label={`Precinct ${p}`} count={c.toLocaleString()} checked={precSel.has(p)} onChange={() => setPrecSel((s) => toggleSet(s, p))} />
            ))}
          </FilterSection>
        </aside>

        {/* ── Table ─────────────────────────────────────────────────── */}
        <div className="vot-main">
          <div className="vot-toolbar">
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn ghost filters-fab" onClick={() => setShowFilters(true)}>
                <SlidersHorizontal style={{ width: 13, height: 13 }} /> Filters{activeCount ? ` · ${activeCount}` : ""}
              </button>
              <span className="mono" style={{ fontWeight: 600 }}>{filtered.length.toLocaleString()}</span>
              <span className="muted">of <span className="mono">{facets.total.toLocaleString()}</span> voters</span>
              {!allParties && <span className="tag">{(Object.keys(party) as Party[]).filter((p) => party[p]).map(partyLabel).join("/") || "none"}</span>}
              {quick && <span className="tag accent">{QUICKS.find((x) => x.k === quick)?.label}</span>}
              {tagSel.size > 0 && <span className="tag">{tagSel.size} tag{tagSel.size > 1 ? "s" : ""}</span>}
              {precSel.size > 0 && <span className="tag">{precSel.size} precinct{precSel.size > 1 ? "s" : ""}</span>}
              {search && <span className="tag">“{search}”</span>}
              {activeCount > 0 && <button className="ai-suggest ghost" style={{ marginLeft: 4 }} type="button" onClick={clearAll}>Clear all</button>}
            </div>
            <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
              <button className="btn ghost" type="button"><Send style={{ width: 13, height: 13 }} /> Add to text queue</button>
              <button className="btn ghost" type="button"><Phone style={{ width: 13, height: 13 }} /> Add to call list</button>
              <button className="btn" type="button"><MoreHorizontal className="ico" /></button>
            </div>
          </div>

          <div className="table-wrap" ref={parentRef}>
            <div style={{ width: TOTAL_W }}>
              <div className="vtbl-head" style={{ width: TOTAL_W }}>
                {COLS.map((c) => (
                  <div key={c.k} className="vcell" style={{ width: c.w }}>
                    {c.k === "check" ? <input type="checkbox" /> : c.label}
                  </div>
                ))}
              </div>
              <div className="vtbl-body" style={{ height: virt.getTotalSize(), width: TOTAL_W }}>
                {virt.getVirtualItems().map((vi) => {
                  const v = filtered[vi.index];
                  return (
                    <div
                      key={v.id}
                      className={"vtbl-row" + (v.id === selected ? " sel" : "")}
                      style={{ height: ROW_H, width: TOTAL_W, transform: `translateY(${vi.start}px)` }}
                      onClick={() => setSelected(v.id)}
                    >
                      {COLS.map((c) => (
                        <div key={c.k} className="vcell" style={{ width: c.w }}>{cell(v, c.k, v.id === selected)}</div>
                      ))}
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="muted" style={{ padding: 24, fontSize: 13 }}>No voters match these filters.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Detail drawer ─────────────────────────────────────────── */}
        {sel && <VoterDetail v={sel} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

function cell(v: Voter, k: (typeof COLS)[number]["k"], isSel: boolean) {
  switch (k) {
    case "check":
      return <input type="checkbox" checked={isSel} readOnly onClick={(e) => e.stopPropagation()} />;
    case "name":
      return <span className="name" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</span>;
    case "addr":
      return <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{v.addr}</span>;
    case "precinct":
      return <span className="num">{v.precinct}</span>;
    case "party":
      return <span className={`tag ${partyTag(v.party)}`}>{partyLabel(v.party)}</span>;
    case "age":
      return <span className="num muted">{v.age}</span>;
    case "history":
      return <span className="num">{v.history}</span>;
    case "support":
      return <ScoreBar v={v.support} />;
    case "persuasion":
      return <ScoreBar v={v.persuasion} kind="persuade" />;
    case "last":
      return <span className="muted" style={{ fontSize: 12 }}>{v.last}</span>;
    case "tags":
      return (
        <div className="row" style={{ gap: 4 }}>
          {v.flags.includes("persuadable") && <span className="tag accent">✦</span>}
          {v.flags.includes("volunteer") && <span className="tag indigo">vol</span>}
          {v.flags.includes("donor") && <span className="tag amber">$</span>}
          {v.flags.includes("VBM") && <span className="tag teal">VBM</span>}
          {v.flags.includes("new") && <span className="tag">new</span>}
        </div>
      );
    case "more":
      return <MoreHorizontal style={{ width: 14, height: 14, color: "var(--muted)" }} />;
  }
}

function VoterDetail({ v, onClose }: { v: Voter; onClose: () => void }) {
  const initials = v.name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div
          className="avatar"
          style={{
            width: 36, height: 36, fontSize: 13,
            background: v.party === "D" ? "var(--indigo-2)" : v.party === "R" ? "var(--rose-2)" : "var(--surface-3)",
            color: v.party === "D" ? "var(--indigo)" : v.party === "R" ? "var(--rose)" : "var(--muted)",
          }}
        >
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</div>
          <div className="muted mono" style={{ fontSize: 11.5 }}>{v.id} · age {v.age}</div>
        </div>
        <X className="x" style={{ width: 16, height: 16 }} onClick={onClose} />
      </div>

      <div className="drawer-body">
        {v.persuasion >= 4 && (
          <div className="ai-strip" style={{ marginBottom: 14 }}>
            <div className="ai-mark">AI</div>
            <span>High persuasion · likely <b>housing</b>-motivated. Try renter-relief talking point.</span>
          </div>
        )}

        <div className="field-row"><div className="lbl">Address</div><div className="val">{v.addr}<br /><span className="muted">{v.city}, PA {v.zip}</span></div></div>
        <div className="field-row"><div className="lbl">Precinct</div><div className="val mono">{v.precinct}</div></div>
        <div className="field-row"><div className="lbl">Party</div><div className="val"><span className={`tag ${partyTag(v.party)}`}>{partyFull(v.party)}</span></div></div>
        <div className="field-row"><div className="lbl">Phone</div><div className="val mono">{v.phone} <span className="muted">· verified</span></div></div>
        <div className="field-row"><div className="lbl">Vote history</div><div className="val"><VoteHistory history={v.history} /></div></div>
        <div className="field-row"><div className="lbl">Support</div><div className="val"><ScoreBar v={v.support} /> &nbsp;<span className="muted">{v.support}/5</span></div></div>
        <div className="field-row"><div className="lbl">Persuadability</div><div className="val"><ScoreBar v={v.persuasion} kind="persuade" /> &nbsp;<span className="muted">{v.persuasion}/5</span></div></div>
        <div className="field-row"><div className="lbl">Tags</div><div className="val row" style={{ gap: 4, flexWrap: "wrap" }}>
          {v.flags.length === 0 && <span className="muted" style={{ fontSize: 12 }}>—</span>}
          {v.flags.map((f) => <span key={f} className={`tag ${f === "persuadable" ? "accent" : f === "donor" ? "amber" : f === "VBM" ? "teal" : "indigo"}`}>{f}</span>)}
          <button className="ai-suggest ghost" type="button">+ add tag</button>
        </div></div>

        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, marginBottom: 8 }}>Recent contact history</div>
          <Timeline />
        </div>

        <div className="row" style={{ gap: 6, marginTop: 18 }}>
          <button className="btn" type="button"><Phone style={{ width: 13, height: 13 }} /> Call</button>
          <button className="btn" type="button"><MessageSquare style={{ width: 13, height: 13 }} /> Text</button>
          <button className="btn" type="button"><Footprints style={{ width: 13, height: 13 }} /> Add to turf</button>
          <button className="btn primary" style={{ marginLeft: "auto" }} type="button"><Sparkles style={{ width: 13, height: 13 }} /> Draft msg</button>
        </div>
      </div>
    </aside>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="filter-section">
      <button className="filter-head" type="button" onClick={() => setOpen((o) => !o)}>
        <ChevronDown style={{ width: 12, height: 12, transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform .15s" }} />
        <span>{title}</span>
      </button>
      {open && <div className="filter-body">{children}</div>}
    </div>
  );
}

function Check({ label, count, checked = false, tone, ghost, onChange }: {
  label: string; count?: string; checked?: boolean; tone?: string; ghost?: boolean; onChange?: (v: boolean) => void;
}) {
  const dot: Record<string, string> = {
    dem: "oklch(0.55 0.14 255)", rep: "oklch(0.55 0.16 25)", ind: "var(--muted)",
    accent: "var(--accent)", amber: "var(--amber)", rose: "var(--rose)",
    indigo: "var(--indigo)", teal: "var(--teal)",
  };
  return (
    <label className={"check-row" + (ghost ? " ghost" : "")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange?.(e.target.checked)} />
      {tone && <span className="dot" style={{ background: dot[tone] }} />}
      <span className="check-label">{label}</span>
      {count && <span className="check-count mono">{count}</span>}
    </label>
  );
}

function Chip({ children, ai, active, onClick }: { children: React.ReactNode; ai?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <button
      className={"chip" + (ai ? " ai" : "")}
      type="button"
      onClick={onClick}
      style={active ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : undefined}
    >
      {children}
    </button>
  );
}

function RangeMini({ defs, counts, selected, onToggle }: {
  defs: { v: number; n: string }[]; counts: number[]; selected: Set<number>; onToggle: (v: number) => void;
}) {
  const max = Math.max(1, ...counts);
  return (
    <div className="range-mini">
      {defs.map((b) => {
        const c = counts[b.v - 1] ?? 0;
        const on = selected.has(b.v);
        return (
          <button key={b.v} className="rm-row" type="button" onClick={() => onToggle(b.v)}
            style={on ? { background: "var(--surface-3)", borderRadius: 5 } : undefined}>
            <span className="rm-num mono">{on ? "✓" : b.v}</span>
            <span className="rm-bar"><i style={{ width: `${(c / max) * 100}%`, background: b.v >= 4 ? "var(--accent)" : b.v <= 2 ? "var(--rose)" : "var(--mute-2)" }} /></span>
            <span className="rm-lbl">{b.n}</span>
            <span className="rm-count mono">{c.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScoreBar({ v, kind }: { v: number; kind?: string }) {
  return (
    <div className={`score-bar ${kind || ""}`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? "on" : ""} />)}
    </div>
  );
}

function VoteHistory({ history }: { history: string }) {
  const m = history.match(/(\d+)\/(\d+)/);
  const got = m ? parseInt(m[1]) : 0;
  const labels = ["G24", "G22", "G20", "G18"];
  return (
    <div className="vote-history">
      {labels.map((label, i) => {
        const filled = i < got;
        return (
          <div key={label} className="vote-cell" data-on={filled}>
            <span className="mono">{label}</span>
            {filled ? <CheckIcon style={{ width: 11, height: 11 }} /> : <Minus style={{ width: 11, height: 11 }} />}
          </div>
        );
      })}
    </div>
  );
}

function Timeline() {
  const events = [
    { t: "3d ago", who: "Door · Imani B.", text: "Strong support · housing", tone: "good" },
    { t: "12d ago", who: "Text · auto", text: "VBM reminder sent", tone: "neutral" },
    { t: "34d ago", who: "Mail · HQ", text: "Intro mailer · district", tone: "neutral" },
    { t: "Apr 2", who: "Door · Felicia B.", text: "Not home", tone: "miss" },
  ];
  return (
    <div className="timeline">
      {events.map((e, i) => (
        <div key={i} className="tl-row">
          <div className="tl-dot" data-tone={e.tone} />
          <div className="tl-time mono">{e.t}</div>
          <div className="tl-body">
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{e.text}</div>
            <div className="muted" style={{ fontSize: 11 }}>{e.who}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
