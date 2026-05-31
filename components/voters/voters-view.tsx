"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Plus, SlidersHorizontal, Sparkles, Search, Send, Phone, MoreHorizontal,
  X, ChevronDown, MessageSquare, Footprints, Check as CheckIcon, Minus,
} from "lucide-react";
import { VOTERS, type Voter, type Party, partyLabel, partyFull, partyTag } from "@/lib/mock-data";

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

export function VotersView({ initialVoters }: { initialVoters?: Voter[] }) {
  const ALL = initialVoters && initialVoters.length ? initialVoters : VOTERS;
  const [selected, setSelected] = useState<string | null>("V-014825");
  const [party, setParty] = useState<Record<Party, boolean>>({ D: true, R: true, I: true });
  const [search, setSearch] = useState("");
  const [persuadableOnly, setPersuadableOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL.filter((v) => {
      if (!party[v.party]) return false;
      if (persuadableOnly && !v.flags.includes("persuadable")) return false;
      if (q && !(`${v.name} ${v.addr} ${v.precinct} ${v.phone}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [ALL, party, search, persuadableOnly]);

  const sel = useMemo(() => ALL.find((v) => v.id === selected) ?? null, [ALL, selected]);

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
            <span className="mono">412,847</span> voters in PA-12 ·&nbsp;
            <span className="mono">8,124</span> contacted this cycle ·&nbsp;
            <span className="mono">1,247</span> VBM
          </div>
        </div>
        <div className="acts">
          <button className="btn" type="button"><Plus className="ico" /> Import</button>
          <button className="btn" type="button"><SlidersHorizontal className="ico" /> Saved views</button>
          <button className="btn accent" type="button"><Sparkles className="ico" /> Ask Candi</button>
        </div>
      </div>

      <div className="vot-body">
        {/* ── Filter rail ───────────────────────────────────────────── */}
        <aside className="filter-rail">
          <div className="filter-search">
            <Search className="ico" style={{ width: 14, height: 14, color: "var(--muted)" }} />
            <input placeholder="Name, address, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="kbd">⌘F</span>
          </div>

          <FilterSection title="Quick filters">
            <Chip active={persuadableOnly} onClick={() => setPersuadableOnly((v) => !v)}>Persuadable (1,824)</Chip>
            <Chip>High-support · low-turnout (612)</Chip>
            <Chip>VBM outstanding (482)</Chip>
            <Chip>Never contacted (24,907)</Chip>
            <Chip ai>✦ Candi recommends · Tier 1 (1,140)</Chip>
          </FilterSection>

          <FilterSection title="Party">
            <Check label="Democrat" count="184,221" checked={party.D} tone="dem" onChange={(v) => setParty((p) => ({ ...p, D: v }))} />
            <Check label="Republican" count="151,008" checked={party.R} tone="rep" onChange={(v) => setParty((p) => ({ ...p, R: v }))} />
            <Check label="Independent / NPA" count="77,618" checked={party.I} tone="ind" onChange={(v) => setParty((p) => ({ ...p, I: v }))} />
          </FilterSection>

          <FilterSection title="Support score"><RangeMini /></FilterSection>

          <FilterSection title="Vote history">
            <Check label="Perfect (4/4)" count="218,142" />
            <Check label="Skipped 1+" count="142,067" />
            <Check label="New voters" count="12,840" />
          </FilterSection>

          <FilterSection title="Tags">
            <Check label="Persuadable" count="1,824" tone="accent" checked={persuadableOnly} onChange={(v) => setPersuadableOnly(v)} />
            <Check label="Volunteer" count="412" />
            <Check label="Donor" count="184" />
            <Check label="VBM requested" count="1,247" tone="amber" />
            <Check label="Do-not-contact" count="86" tone="rose" />
          </FilterSection>

          <FilterSection title="Geography">
            <Check label="Precinct 07N" count="14,212" checked />
            <Check label="Precinct 12S" count="16,408" checked />
            <Check label="Precinct 03W" count="11,884" checked />
            <Check label="Precinct 14E" count="13,562" checked />
            <Check label="+ 28 more" count="" ghost />
          </FilterSection>
        </aside>

        {/* ── Table ─────────────────────────────────────────────────── */}
        <div className="vot-main">
          <div className="vot-toolbar">
            <div className="row" style={{ gap: 6 }}>
              <span className="mono" style={{ fontWeight: 600 }}>{filtered.length.toLocaleString()}</span>
              <span className="muted">of <span className="mono">412,847</span> voters · filtered by</span>
              <span className="tag">{party.D && party.R && party.I ? "All parties" : Object.keys(party).filter((p) => party[p as Party]).join("/")}</span>
              {persuadableOnly && <span className="tag accent">Persuadable</span>}
              {search && <span className="tag">“{search}”</span>}
              <button className="ai-suggest ghost" style={{ marginLeft: 4 }} type="button">+ filter</button>
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

function RangeMini() {
  const buckets = [
    { v: 1, n: "Strong opp.", c: "82,140" },
    { v: 2, n: "Lean opp.", c: "61,228" },
    { v: 3, n: "Undecided", c: "94,512" },
    { v: 4, n: "Lean support", c: "79,840" },
    { v: 5, n: "Strong supp.", c: "95,127" },
  ];
  const max = 95127;
  return (
    <div className="range-mini">
      {buckets.map((b) => (
        <button key={b.v} className="rm-row" type="button">
          <span className="rm-num mono">{b.v}</span>
          <span className="rm-bar"><i style={{ width: `${(parseInt(b.c.replace(/,/g, "")) / max) * 100}%`, background: b.v >= 4 ? "var(--accent)" : b.v <= 2 ? "var(--rose)" : "var(--mute-2)" }} /></span>
          <span className="rm-lbl">{b.n}</span>
          <span className="rm-count mono">{b.c}</span>
        </button>
      ))}
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
