"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Plus, SlidersHorizontal, Sparkles, Search, Send, Phone, MoreHorizontal,
  X, ChevronDown, MessageSquare, Footprints, Check as CheckIcon, Minus,
  PanelLeftClose, PanelLeftOpen, Copy, Trash2, Download, Loader2, Mail, Users,
} from "lucide-react";
import { VOTERS, CAMPAIGN, type Voter, type Party, partyLabel, partyFull, partyTag } from "@/lib/mock-data";
import { MAX_M, voteCount } from "@/lib/elections";
import { updateVoter, tagVoters, getHousehold, getVoterContacts, type HouseholdMember, type VoterContact } from "@/app/(app)/voters/actions";

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
const QUICKS: { k: string; label: string; ai?: boolean; rec?: boolean; match: (v: Voter) => boolean }[] = [
  { k: "persuadable", label: "Persuadable", match: (v) => v.flags.includes("persuadable") },
  { k: "highlow", label: "High-support · low-turnout", match: (v) => v.support >= 4 && turnoutPct(v.history) < 100 },
  { k: "vbm", label: "VBM outstanding", match: (v) => v.flags.includes("VBM") },
  { k: "never", label: "Never contacted", match: (v) => !v.last || v.last === "—" },
  // The AI-recommended tier — styled lime (the accent token) so it reads as Candi's pick.
  { k: "tier1", label: "✦ Candi recommends · Tier 1", ai: true, rec: true, match: (v) => v.persuasion >= 4 },
];
const SUPPORT_DEFS = [
  { v: 1, n: "Strong opp." }, { v: 2, n: "Lean opp." }, { v: 3, n: "Undecided" },
  { v: 4, n: "Lean support" }, { v: 5, n: "Strong supp." },
];
const GENDER_DEFS = [
  { k: "M", label: "Male" }, { k: "F", label: "Female" }, { k: "X", label: "Other / X" },
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

export function VotersView({
  initialVoters,
  district,
  contactedCount,
}: {
  initialVoters?: Voter[];
  /** Active campaign's district label, e.g. "FL-25". Falls back to the demo. */
  district?: string | null;
  /** Real distinct-contacted-voter count for the active campaign. */
  contactedCount?: number;
}) {
  const usingLive = !!(initialVoters && initialVoters.length);
  // Local, mutable copy of the loaded voter set so edits (support, tags) and bulk
  // tagging reflect immediately in the grid, facets, and detail card. Persisted to
  // the DB via server actions when live; optimistic-only for the mock demo.
  const [rows, setRows] = useState<Voter[]>(() => (usingLive ? initialVoters! : VOTERS));
  const ALL = rows;
  // District + contacted come from the server for live campaigns; fall back to the
  // demo values (mock district, contact-history-derived count) when showing mock data.
  const districtLabel = usingLive ? district ?? "" : CAMPAIGN.district;
  const [selected, setSelected] = useState<string | null>(null);
  // Deep-link: /voters?v=<external_id> (e.g. clicking a dot on the turf map)
  // opens that voter's detail card on mount. Read from the URL directly to avoid
  // the useSearchParams Suspense requirement.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("v");
    if (v) setSelected(v);
  }, []);
  // Checkbox multi-select set (voter ids) for the toolbar bulk actions.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [party, setParty] = useState<Record<Party, boolean>>({ D: true, R: true, I: true });
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<string | null>(null);
  const [tagSel, setTagSel] = useState<Set<string>>(new Set());
  const [precSel, setPrecSel] = useState<Set<string>>(new Set());
  const [supportSel, setSupportSel] = useState<Set<number>>(new Set());
  const [raceSel, setRaceSel] = useState<Set<string>>(new Set());
  const [genderSel, setGenderSel] = useState<Set<string>>(new Set());
  const [citySel, setCitySel] = useState<Set<string>>(new Set());
  // Super-voter control: "voted in at least N of the last M elections".
  const [svOn, setSvOn] = useState(false);
  const [svN, setSvN] = useState(3);
  const [svM, setSvM] = useState(MAX_M);
  const [showFilters, setShowFilters] = useState(false); // mobile drawer
  const [railOpen, setRailOpen] = useState(true); // desktop filter-rail collapse

  // facet options + counts, derived from the loaded voter set (live or mock)
  const facets = useMemo(() => {
    const partyCounts: Record<Party, number> = { D: 0, R: 0, I: 0 };
    const precinct = new Map<string, number>();
    const tagCounts: Record<string, number> = {};
    const support = [0, 0, 0, 0, 0];
    const race = new Map<string, number>();
    const gender: Record<string, number> = { M: 0, F: 0, X: 0 };
    const city = new Map<string, number>();
    const quickCounts: Record<string, number> = {};
    let contacted = 0;
    for (const v of ALL) {
      partyCounts[v.party] = (partyCounts[v.party] ?? 0) + 1;
      if (v.precinct) precinct.set(v.precinct, (precinct.get(v.precinct) ?? 0) + 1);
      for (const f of v.flags) tagCounts[f] = (tagCounts[f] ?? 0) + 1;
      if (v.support >= 1 && v.support <= 5) support[v.support - 1]++;
      if (v.race) race.set(v.race, (race.get(v.race) ?? 0) + 1);
      if (v.gender && v.gender in gender) gender[v.gender]++;
      if (v.city) city.set(v.city, (city.get(v.city) ?? 0) + 1);
      for (const Q of QUICKS) if (Q.match(v)) quickCounts[Q.k] = (quickCounts[Q.k] ?? 0) + 1;
      if (v.last && v.last !== "—") contacted++;
    }
    return {
      partyCounts, tagCounts, support, gender, quickCounts, contacted,
      precinctList: [...precinct.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      raceList: [...race.entries()].sort((a, b) => b[1] - a[1]),
      cityList: [...city.entries()].sort((a, b) => b[1] - a[1]),
      total: ALL.length,
    };
  }, [ALL]);

  // Contacted count: the server's real distinct-contacted figure for live
  // campaigns; the contact-history-derived count for the mock demo set.
  const contacted = usingLive ? contactedCount ?? 0 : facets.contacted;

  // Live count of voters matching the current super-voter (N-of-M) threshold.
  const svCount = useMemo(
    () => ALL.reduce((n, v) => n + (voteCount(v.elections, svM) >= svN ? 1 : 0), 0),
    [ALL, svN, svM]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeQuick = quick ? QUICKS.find((x) => x.k === quick) : null;
    return ALL.filter((v) => {
      if (!party[v.party]) return false;
      if (precSel.size && !precSel.has(v.precinct)) return false;
      if (supportSel.size && !supportSel.has(v.support)) return false;
      if (tagSel.size && !v.flags.some((f) => tagSel.has(f))) return false;
      if (svOn && voteCount(v.elections, svM) < svN) return false;
      if (raceSel.size && !(v.race && raceSel.has(v.race))) return false;
      if (genderSel.size && !(v.gender && genderSel.has(v.gender))) return false;
      if (citySel.size && !(v.city && citySel.has(v.city))) return false;
      if (activeQuick && !activeQuick.match(v)) return false;
      if (q && !`${v.name} ${v.addr} ${v.precinct} ${v.phone}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ALL, party, precSel, supportSel, tagSel, svOn, svN, svM, raceSel, genderSel, citySel, quick, search]);

  const sel = useMemo(() => ALL.find((v) => v.id === selected) ?? null, [ALL, selected]);

  const allParties = party.D && party.R && party.I;
  const activeCount =
    (allParties ? 0 : 1) + (quick ? 1 : 0) + tagSel.size + precSel.size + supportSel.size +
    (svOn ? 1 : 0) + raceSel.size + genderSel.size + citySel.size + (search ? 1 : 0);

  const clearAll = () => {
    setParty({ D: true, R: true, I: true });
    setQuick(null);
    setTagSel(new Set());
    setPrecSel(new Set());
    setSupportSel(new Set());
    setSvOn(false);
    setRaceSel(new Set());
    setGenderSel(new Set());
    setCitySel(new Set());
    setSearch("");
  };

  // Transient toast for bulk-action feedback.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Optimistically patch one voter (support and/or tags) in local state, then
  // persist to the DB (live campaigns only). On a failed write we revert.
  const patchVoter = useCallback(
    (id: string, patch: { support?: number; flags?: string[] }) => {
      let prev: Voter | undefined;
      setRows((rs) =>
        rs.map((v) => {
          if (v.id !== id) return v;
          prev = v;
          return { ...v, ...patch };
        })
      );
      if (!usingLive) return; // mock demo — optimistic only, nothing to persist
      startSave(async () => {
        const res = await updateVoter(id, patch);
        if (!res.ok && prev) {
          const reverted = prev;
          setRows((rs) => rs.map((v) => (v.id === id ? reverted : v)));
          setToast("Couldn't save that change — please try again.");
        }
      });
    },
    [usingLive]
  );

  // ── Selection (checkbox) helpers ───────────────────────────────────────────
  const filteredIds = useMemo(() => filtered.map((v) => v.id), [filtered]);
  const allFilteredChecked = filteredIds.length > 0 && filteredIds.every((id) => checkedIds.has(id));
  const someFilteredChecked = filteredIds.some((id) => checkedIds.has(id));
  const toggleChecked = useCallback((id: string) => {
    setCheckedIds((s) => toggleSet(s, id));
  }, []);
  const toggleAllFiltered = useCallback(() => {
    setCheckedIds((s) => {
      const everyOn = filteredIds.length > 0 && filteredIds.every((id) => s.has(id));
      if (everyOn) {
        const n = new Set(s);
        filteredIds.forEach((id) => n.delete(id));
        return n;
      }
      return new Set([...s, ...filteredIds]);
    });
  }, [filteredIds]);
  const clearSelection = useCallback(() => setCheckedIds(new Set()), []);

  // Bulk-tag the checked voters (optimistic), then persist via the bulk action.
  const bulkTag = useCallback(
    (tag: string, label: string) => {
      const ids = [...checkedIds];
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setRows((rs) =>
        rs.map((v) =>
          idSet.has(v.id) && !v.flags.includes(tag) ? { ...v, flags: [...v.flags, tag] } : v
        )
      );
      if (!usingLive) {
        setToast(`Added ${ids.length.toLocaleString()} voter${ids.length === 1 ? "" : "s"} to the ${label}.`);
        return;
      }
      startSave(async () => {
        const res = await tagVoters(ids, tag);
        if (res.ok) {
          setToast(`Added ${ids.length.toLocaleString()} voter${ids.length === 1 ? "" : "s"} to the ${label}.`);
        } else {
          // revert optimistic add
          setRows((rs) =>
            rs.map((v) => (idSet.has(v.id) ? { ...v, flags: v.flags.filter((f) => f !== tag) } : v))
          );
          setToast(`Couldn't update the ${label} — please try again.`);
        }
      });
    },
    [checkedIds, usingLive]
  );

  // Export the checked voters' visible columns to CSV (client-side download).
  const exportSelection = useCallback(() => {
    const ids = new Set(checkedIds);
    const picked = ALL.filter((v) => ids.has(v.id));
    if (picked.length === 0) return;
    const headers = ["Voter ID", "Name", "Address", "City", "Zip", "Precinct", "Party", "Age", "Vote history", "Support", "Persuadability", "Phone", "Tags"];
    const esc = (val: string | number) => {
      const s = String(val ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const v of picked) {
      lines.push([
        v.id, v.name, v.addr, v.city, v.zip, v.precinct, partyFull(v.party),
        v.age, v.history, v.support, v.persuasion, v.phone, v.flags.join(" | "),
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candi-voters-${picked.length}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast(`Exported ${picked.length.toLocaleString()} voter${picked.length === 1 ? "" : "s"} to CSV.`);
  }, [ALL, checkedIds]);

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
            <span className="mono">{facets.total.toLocaleString()}</span>
            {districtLabel ? <> voters in {districtLabel}</> : " voters"} ·&nbsp;
            <span className="mono">{contacted.toLocaleString()}</span> contacted ·&nbsp;
            <span className="mono">{(facets.tagCounts.VBM ?? 0).toLocaleString()}</span> VBM
          </div>
        </div>
        <div className="acts">
          <button className="btn" type="button"><Plus className="ico" /> Import</button>
          <button className="btn" type="button"><SlidersHorizontal className="ico" /> Saved views</button>
        </div>
      </div>

      <div className={"vot-body" + (sel ? " detail-open" : "") + (railOpen ? "" : " rail-collapsed")}>
        {/* mobile backdrop behind the filter drawer */}
        <div className={"filter-backdrop" + (showFilters ? " open" : "")} onClick={() => setShowFilters(false)} />

        {/* ── Filter rail ───────────────────────────────────────────── */}
        <aside className={"filter-rail" + (showFilters ? " open" : "")}>
          <div className="filter-rail-close">
            <span>Filters{activeCount ? ` · ${activeCount}` : ""}</span>
            <X style={{ width: 18, height: 18, cursor: "pointer" }} onClick={() => setShowFilters(false)} />
          </div>

          {/* Desktop collapse header — hides the whole rail so the table reclaims width. */}
          <div className="filter-rail-collapse">
            <span className="filter-rail-title">Filters{activeCount ? ` · ${activeCount}` : ""}</span>
            <button
              type="button"
              className="filter-rail-toggle"
              aria-label="Collapse filters"
              aria-expanded={true}
              onClick={() => setRailOpen(false)}
            >
              <PanelLeftClose style={{ width: 15, height: 15 }} />
            </button>
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
              <Chip key={Q.k} ai={Q.ai} rec={Q.rec} active={quick === Q.k} onClick={() => setQuick((c) => (c === Q.k ? null : Q.k))}>
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
            <SuperVoter
              on={svOn} n={svN} m={svM} count={svCount} total={facets.total}
              onToggle={setSvOn} onN={setSvN} onM={setSvM}
            />
          </FilterSection>

          <FilterSection title="Race / ethnicity">
            {facets.raceList.length === 0 && <span className="muted" style={{ fontSize: 12, padding: "4px 8px" }}>No race data</span>}
            {facets.raceList.map(([rc, c]) => (
              <Check key={rc} label={rc} count={c.toLocaleString()} checked={raceSel.has(rc)} onChange={() => setRaceSel((s) => toggleSet(s, rc))} />
            ))}
          </FilterSection>

          <FilterSection title="Gender">
            {GENDER_DEFS.map((g) => (
              <Check key={g.k} label={g.label} count={(facets.gender[g.k] ?? 0).toLocaleString()} checked={genderSel.has(g.k)} onChange={() => setGenderSel((s) => toggleSet(s, g.k))} />
            ))}
          </FilterSection>

          <FilterSection title="Tags">
            {TAG_DEFS.map((t) => (
              <Check key={t.k} label={t.label} count={(facets.tagCounts[t.k] ?? 0).toLocaleString()} tone={t.tone} checked={tagSel.has(t.k)} onChange={() => setTagSel((s) => toggleSet(s, t.k))} />
            ))}
          </FilterSection>

          <FilterSection title="City / municipality">
            {facets.cityList.length === 0 && <span className="muted" style={{ fontSize: 12, padding: "4px 8px" }}>No city data</span>}
            {facets.cityList.map(([ct, c]) => (
              <Check key={ct} label={ct} count={c.toLocaleString()} checked={citySel.has(ct)} onChange={() => setCitySel((s) => toggleSet(s, ct))} />
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
              {!railOpen && (
                <button
                  type="button"
                  className="btn accent rail-reopen"
                  aria-label="Show filters"
                  aria-expanded={false}
                  onClick={() => setRailOpen(true)}
                >
                  <PanelLeftOpen style={{ width: 13, height: 13 }} /> Filters{activeCount ? ` · ${activeCount}` : ""}
                </button>
              )}
              <span className="mono" style={{ fontWeight: 600 }}>{filtered.length.toLocaleString()}</span>
              <span className="muted">of <span className="mono">{facets.total.toLocaleString()}</span> voters</span>
              {!allParties && <span className="tag">{(Object.keys(party) as Party[]).filter((p) => party[p]).map(partyLabel).join("/") || "none"}</span>}
              {quick && <span className="tag accent">{QUICKS.find((x) => x.k === quick)?.label}</span>}
              {svOn && <span className="tag accent">≥{svN} of last {svM}</span>}
              {raceSel.size > 0 && <span className="tag">{raceSel.size} race{raceSel.size > 1 ? "s" : ""}</span>}
              {genderSel.size > 0 && <span className="tag">{[...genderSel].join("/")}</span>}
              {citySel.size > 0 && <span className="tag">{citySel.size} cit{citySel.size > 1 ? "ies" : "y"}</span>}
              {tagSel.size > 0 && <span className="tag">{tagSel.size} tag{tagSel.size > 1 ? "s" : ""}</span>}
              {precSel.size > 0 && <span className="tag">{precSel.size} precinct{precSel.size > 1 ? "s" : ""}</span>}
              {search && <span className="tag">“{search}”</span>}
              {activeCount > 0 && <button className="ai-suggest ghost" style={{ marginLeft: 4 }} type="button" onClick={clearAll}>Clear all</button>}
            </div>
            <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
              {checkedIds.size > 0 && (
                <span className="tag accent vot-selcount" aria-live="polite">{checkedIds.size.toLocaleString()} selected</span>
              )}
              <button
                className="btn ghost"
                type="button"
                disabled={checkedIds.size === 0}
                onClick={() => bulkTag("text-queue", "text queue")}
              >
                <Send style={{ width: 13, height: 13 }} /> Add to text queue
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={checkedIds.size === 0}
                onClick={() => bulkTag("call-list", "call list")}
              >
                <Phone style={{ width: 13, height: 13 }} /> Add to call list
              </button>
              <BulkMenu
                count={checkedIds.size}
                onClear={clearSelection}
                onExport={exportSelection}
              />
            </div>
          </div>

          <div className="table-wrap" ref={parentRef}>
            <div style={{ width: TOTAL_W }}>
              <div className="vtbl-head" style={{ width: TOTAL_W }}>
                {COLS.map((c) => (
                  <div key={c.k} className="vcell" style={{ width: c.w }}>
                    {c.k === "check" ? (
                      <input
                        type="checkbox"
                        aria-label="Select all filtered voters"
                        checked={allFilteredChecked}
                        ref={(el) => { if (el) el.indeterminate = !allFilteredChecked && someFilteredChecked; }}
                        onChange={toggleAllFiltered}
                        disabled={filteredIds.length === 0}
                      />
                    ) : c.label}
                  </div>
                ))}
              </div>
              <div className="vtbl-body" style={{ height: virt.getTotalSize(), width: TOTAL_W }}>
                {virt.getVirtualItems().map((vi) => {
                  const v = filtered[vi.index];
                  const isChecked = checkedIds.has(v.id);
                  return (
                    <div
                      key={v.id}
                      className={"vtbl-row" + (v.id === selected ? " sel" : "")}
                      style={{ height: ROW_H, width: TOTAL_W, transform: `translateY(${vi.start}px)` }}
                      // Click toggles the detail bar: a second click on the open row deselects.
                      onClick={() => setSelected((cur) => (cur === v.id ? null : v.id))}
                    >
                      {COLS.map((c) => (
                        <div key={c.k} className="vcell" style={{ width: c.w }}>
                          {c.k === "check"
                            ? <input
                                type="checkbox"
                                aria-label={`Select ${v.name}`}
                                checked={isChecked}
                                onChange={() => toggleChecked(v.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            : cell(v, c.k, v.id === selected)}
                        </div>
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
        {sel && (
          <VoterDetail
            v={sel}
            onClose={() => setSelected(null)}
            onPatch={(patch) => patchVoter(sel.id, patch)}
            onSelect={(id) => setSelected(id)}
          />
        )}
      </div>

      {toast && <div className="vot-toast" role="status">{toast}</div>}
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

function VoterDetail({
  v,
  onClose,
  onPatch,
  onSelect,
}: {
  v: Voter;
  onClose: () => void;
  onPatch: (patch: { support?: number; flags?: string[] }) => void;
  /** Switch the selected voter (used by the household list to pivot to a co-resident). */
  onSelect: (id: string) => void;
}) {
  const initials = v.name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  // Sanitize phone for tel:/sms: (keep digits + a leading +); empty → buttons disabled.
  const tel = (v.phone || "").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const email = (v.email || "").trim();
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
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
          <div className="muted mono" style={{ fontSize: 11.5 }}>
            {v.id} · age {v.age}
            {/* VAN id (campaign-tool id), shown only when the voter was VAN-enriched. */}
            {v.vanid && <> · VAN <span title="VAN Voter File ID">{v.vanid}</span></>}
          </div>
        </div>
        <button type="button" className="x vot-x" aria-label="Close" onClick={onClose}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      <div className="drawer-body vd-body">
        {/* AI strip (persuasion insight) — unchanged behavior. */}
        {v.persuasion >= 4 && (
          <div className="ai-strip vd-ai">
            <div className="ai-mark">AI</div>
            <span>High persuasion · likely <b>housing</b>-motivated. Try renter-relief talking point.</span>
          </div>
        )}

        {/* Identity */}
        <DetailSection title="Identity">
          <div className="field-row"><div className="lbl">Address</div><div className="val">{v.addr}<br /><span className="muted">{v.city}, {v.state || "PA"} {v.zip}</span></div></div>
          {/* Mailing address — only when present AND different from residence (set
              upstream in the voters page). Helps reach voters who get mail elsewhere. */}
          {v.mailingAddress && (
            <div className="field-row"><div className="lbl">Mailing</div><div className="val">{v.mailingAddress}</div></div>
          )}
          <div className="field-row"><div className="lbl">Precinct</div><div className="val mono">{v.precinct}</div></div>
          <div className="field-row"><div className="lbl">Party</div><div className="val"><span className={`tag ${partyTag(v.party)}`}>{partyFull(v.party)}</span></div></div>
          <div className="field-row"><div className="lbl">Age</div><div className="val mono">{v.age || <span className="muted">—</span>}</div></div>
        </DetailSection>

        {/* Contact */}
        <DetailSection title="Contact">
          <div className="field-row"><div className="lbl">Phone</div><div className="val mono">{v.phone ? <>{v.phone} <span className="muted">· verified</span></> : <span className="muted">No phone on file</span>}</div></div>
          <div className="field-row"><div className="lbl">Email</div><div className="val">
            {email
              ? <a className="hh-email" href={`mailto:${email}`} title={`Email ${v.name}`}><Mail style={{ width: 12, height: 12 }} /> {email}</a>
              : <span className="muted">No email on file</span>}
          </div></div>
        </DetailSection>

        {/* Scores — editable support pips + persuasion */}
        <DetailSection title="Scores">
          <div className="field-row"><div className="lbl">Support</div><div className="val row" style={{ gap: 8 }}>
            <EditableScore value={v.support} onSet={(n) => onPatch({ support: n })} />
            <span className="muted">{v.support || 0}/5</span>
          </div></div>
          <div className="field-row"><div className="lbl">Persuadability</div><div className="val row" style={{ gap: 8 }}><ScoreBar v={v.persuasion} kind="persuade" /><span className="muted">{v.persuasion}/5</span></div></div>
          <div className="field-row"><div className="lbl">Vote history</div><div className="val"><VoteHistory history={v.history} /></div></div>
        </DetailSection>

        {/* Tags — editable chips + add-tag */}
        <DetailSection title="Tags">
          <TagEditor flags={v.flags} onSet={(flags) => onPatch({ flags })} />
        </DetailSection>

        {/* Household — others at this address */}
        <Household voterId={v.id} onSelect={onSelect} />

        {/* Activity — real contact history for this voter (door logs, texts, calls) */}
        <DetailSection title="Activity">
          <Timeline voterId={v.id} />
        </DetailSection>
      </div>

      {/* Actions — pinned at the bottom of the card */}
      <div className="vd-actions">
        {/* Call / Text → real tel: / sms: links; disabled (greyed) when no phone. */}
        {tel ? (
          <a className="btn" href={`tel:${tel}`}><Phone style={{ width: 13, height: 13 }} /> Call</a>
        ) : (
          <button className="btn" type="button" disabled title="No phone on file"><Phone style={{ width: 13, height: 13 }} /> Call</button>
        )}
        {tel ? (
          <a className="btn" href={`sms:${tel}`}><MessageSquare style={{ width: 13, height: 13 }} /> Text</a>
        ) : (
          <button className="btn" type="button" disabled title="No phone on file"><MessageSquare style={{ width: 13, height: 13 }} /> Text</button>
        )}
        {/* Add to turf: no voter↔turf membership model yet — honest interim. */}
        <button className="btn" type="button" disabled title="Soon — voter-to-turf assignment is coming">
          <Footprints style={{ width: 13, height: 13 }} /> Add to turf <span className="vot-soon">Soon</span>
        </button>
        <DraftButton v={v} />
      </div>
    </aside>
  );
}

// Labeled section for the detail card: a small uppercase header + grouped body,
// with consistent vertical rhythm between sections. Purely presentational.
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="vd-section">
      <h3 className="vd-section-h">{title}</h3>
      <div className="vd-section-body">{children}</div>
    </section>
  );
}

// "Others at this address" — co-residents of the selected voter, fetched on the
// client via getHousehold (RLS-scoped, active campaign). Clicking a member pivots
// the detail card to that person. Large groups (a building with no unit numbers)
// are labelled as such so they aren't mistaken for one family.
const HH_BUILDING_THRESHOLD = 10; // > this ⇒ treat as a building, not a household
function Household({ voterId, onSelect }: { voterId: string; onSelect: (id: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setMembers([]);
    getHousehold(voterId)
      .then((res) => { if (live) setMembers(res.members); })
      .catch(() => { if (live) setMembers([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [voterId]);

  const n = members.length;
  const isBuilding = n > HH_BUILDING_THRESHOLD;
  // Heading: household for a normal group; "building" framing for large stacks.
  const heading = loading
    ? "Household"
    : n === 0
      ? "Household"
      : isBuilding
        ? `${n.toLocaleString()} voters at this building`
        : `Household · ${n} at this address`;

  return (
    <section className="vd-section hh">
      <div className="hh-head vd-section-h">
        <Users style={{ width: 12, height: 12 }} />
        <span>{heading}</span>
      </div>
      {loading ? (
        <div className="hh-empty muted"><Loader2 className="vot-spin" style={{ width: 13, height: 13 }} /> Loading…</div>
      ) : n === 0 ? (
        <div className="hh-empty muted">Only voter at this address.</div>
      ) : (
        <>
          {isBuilding && (
            <div className="hh-note muted">Same street address — units aren&apos;t broken out in the voter file.</div>
          )}
          <ul className="hh-list">
            {members.map((m) => (
              <li key={m.id}>
                <button type="button" className="hh-member" onClick={() => onSelect(m.id)} title={`Open ${m.name}`}>
                  <span className="hh-name">{m.name || "—"}</span>
                  <span className={`tag ${partyTag(m.party)} hh-party`}>{partyLabel(m.party)}</span>
                  {m.age ? <span className="hh-age muted mono">{m.age}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// 1–5 support score, click a pip to set (writes voters.support). Click the active
// top pip again to clear back to 0 (no support). Optimistic via onSet.
function EditableScore({ value, onSet }: { value: number; onSet: (n: number) => void }) {
  return (
    <div className="score-bar vot-score-edit" role="group" aria-label="Set support score">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`Set support ${i} of 5`}
          aria-pressed={i <= value}
          className={i <= value ? "on" : ""}
          onClick={() => onSet(value === i ? 0 : i)}
        />
      ))}
    </div>
  );
}

const QUICK_TAGS = ["persuadable", "volunteer", "donor", "VBM", "new"];
function tagTone(f: string): string {
  return f === "persuadable" ? "accent" : f === "donor" ? "amber" : f === "VBM" ? "teal" : f === "new" ? "" : "indigo";
}

// Tag editor: removable chips + a "+ add tag" quick-pick (preset tags) and a
// free-text input. Writes the full flags array via onSet (optimistic + persisted).
function TagEditor({ flags, onSet }: { flags: string[]; onSet: (flags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t || flags.includes(t)) { setText(""); setAdding(false); return; }
    onSet([...flags, t]);
    setText("");
    setAdding(false);
  };
  const remove = (f: string) => onSet(flags.filter((x) => x !== f));
  const presets = QUICK_TAGS.filter((t) => !flags.includes(t));
  return (
    <div className="vot-tag-editor">
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {flags.length === 0 && !adding && <span className="muted" style={{ fontSize: 12 }}>—</span>}
        {flags.map((f) => (
          <span key={f} className={`tag ${tagTone(f)} vot-tag-chip`}>
            {f}
            <button type="button" aria-label={`Remove ${f}`} className="vot-tag-x" onClick={() => remove(f)}>
              <X style={{ width: 10, height: 10 }} />
            </button>
          </span>
        ))}
        {!adding && (
          <button className="ai-suggest ghost" type="button" onClick={() => setAdding(true)}>+ add tag</button>
        )}
      </div>
      {adding && (
        <div className="vot-tag-add">
          <input
            autoFocus
            value={text}
            placeholder="New tag…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(text);
              else if (e.key === "Escape") { setText(""); setAdding(false); }
            }}
            onBlur={() => { if (!text.trim()) setAdding(false); }}
          />
          <button type="button" className="btn" onClick={() => add(text)} disabled={!text.trim()}>Add</button>
          {presets.length > 0 && (
            <div className="vot-tag-presets">
              {presets.map((t) => (
                <button key={t} type="button" className="tag vot-tag-preset" onClick={() => add(t)}>+ {t}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Draft msg → AI draft via POST /api/draft (Claude). Opens a small popover panel
// in the detail card with the generated message; copyable. 503 if key missing.
function DraftButton({ v }: { v: Voter }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v.name, party: v.party, support: v.support, precinct: v.precinct }),
      });
      const text = await res.text();
      if (!res.ok) { setError(text || "Couldn't draft a message."); setDraft(""); }
      else setDraft(text);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, [v]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !draft && !loading) void generate();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="vot-draft" style={{ marginLeft: "auto", position: "relative" }}>
      <button className="btn primary" type="button" aria-expanded={open} onClick={toggle}>
        <Sparkles style={{ width: 13, height: 13 }} /> Draft msg
      </button>
      {open && (
        <div className="vot-draft-pop" role="dialog" aria-label="AI draft message">
          <div className="vot-draft-head">
            <span><Sparkles style={{ width: 12, height: 12 }} /> AI draft</span>
            <X style={{ width: 14, height: 14, cursor: "pointer" }} onClick={() => setOpen(false)} />
          </div>
          {loading && <div className="vot-draft-body muted"><Loader2 className="vot-spin" style={{ width: 14, height: 14 }} /> Drafting…</div>}
          {!loading && error && <div className="vot-draft-body vot-draft-err">{error}</div>}
          {!loading && !error && draft && <div className="vot-draft-body">{draft}</div>}
          {!loading && (
            <div className="vot-draft-acts">
              <button type="button" className="btn ghost" onClick={generate}>Regenerate</button>
              {draft && (
                <button type="button" className="btn" onClick={copy}>
                  <Copy style={{ width: 12, height: 12 }} /> {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ⋯ bulk-actions menu: Clear selection + Export selection (CSV). Both real.
function BulkMenu({ count, onClear, onExport }: { count: number; onClear: () => void; onExport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="vot-menu" ref={ref} style={{ position: "relative" }}>
      <button className="btn" type="button" aria-label="More actions" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="ico" />
      </button>
      {open && (
        <div className="vot-menu-pop" role="menu">
          <button type="button" role="menuitem" disabled={count === 0} onClick={() => { onExport(); setOpen(false); }}>
            <Download style={{ width: 13, height: 13 }} /> Export selection (CSV){count ? ` · ${count}` : ""}
          </button>
          <button type="button" role="menuitem" disabled={count === 0} onClick={() => { onClear(); setOpen(false); }}>
            <Trash2 style={{ width: 13, height: 13 }} /> Clear selection
          </button>
        </div>
      )}
    </div>
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

function Chip({ children, ai, rec, active, onClick }: { children: React.ReactNode; ai?: boolean; rec?: boolean; active?: boolean; onClick?: () => void }) {
  // The recommends chip carries its own lime styling (incl. its active state) via
  // .chip-rec; other chips use the shared dark-ink selected fill.
  return (
    <button
      className={"chip" + (ai ? " ai" : "") + (rec ? " chip-rec" : "") + (active ? " active" : "")}
      type="button"
      onClick={onClick}
      style={!rec && active ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : undefined}
    >
      {children}
    </button>
  );
}

// Super-voter control: "Voted in at least [N] of the last [M] elections".
// N: 1..M, M: 2..MAX_M (default N=3, M=4). A voter passes when
// voteCount(elections, M) >= N. The live matching count is shown below.
function SuperVoter({ on, n, m, count, total, onToggle, onN, onM }: {
  on: boolean; n: number; m: number; count: number; total: number;
  onToggle: (v: boolean) => void; onN: (v: number) => void; onM: (v: number) => void;
}) {
  const setM = (next: number) => {
    const mm = Math.max(2, Math.min(MAX_M, next));
    onM(mm);
    if (n > mm) onN(mm); // keep N ≤ M
  };
  const setN = (next: number) => onN(Math.max(1, Math.min(m, next)));
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="sv-control">
      <label className="check-row" style={{ fontWeight: 500 }}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <span className="check-label">Super voters only</span>
      </label>
      <div className="sv-sentence" style={{ opacity: on ? 1 : 0.5, pointerEvents: on ? "auto" : "none" }}>
        <span>Voted in at least</span>
        <Stepper value={n} min={1} max={m} onChange={setN} />
        <span>of the last</span>
        <Stepper value={m} min={2} max={MAX_M} onChange={setM} />
        <span>elections.</span>
      </div>
      <div className="sv-count muted">
        <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{count.toLocaleString()}</span> match
        {on ? "" : " if enabled"} · {pct}% of loaded
      </div>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span className="sv-stepper">
      <button type="button" aria-label="decrease" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus style={{ width: 11, height: 11 }} />
      </button>
      <span className="mono sv-val">{value}</span>
      <button type="button" aria-label="increase" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus style={{ width: 11, height: 11 }} />
      </button>
    </span>
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

// Relative "3d ago" style time from an ISO timestamp.
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const RESULT_TONE: Record<string, string> = {
  supporter: "good", undecided: "neutral", "not-home": "miss",
  refused: "miss", "lit-dropped": "neutral", moved: "miss",
};

// Real contact history for the selected voter. Door logs from the GPS field app
// (with notes + support) surface here, newest first.
function Timeline({ voterId }: { voterId: string }) {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<VoterContact[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getVoterContacts(voterId)
      .then((rows) => { if (alive) setContacts(rows); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [voterId]);

  if (loading) return <div className="muted" style={{ fontSize: 12 }}>Loading activity…</div>;
  if (contacts.length === 0)
    return <div className="muted" style={{ fontSize: 12 }}>No contact history yet. Door knocks and texts will appear here.</div>;

  const fmtResult = (r: string | null) =>
    r ? r.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Contacted";

  return (
    <div className="timeline">
      {contacts.map((c) => {
        const channel = c.channel.charAt(0).toUpperCase() + c.channel.slice(1);
        const headline =
          fmtResult(c.result) + (c.support != null && c.support > 0 ? ` · support ${c.support}/5` : "");
        return (
          <div key={c.id} className="tl-row">
            <div className="tl-dot" data-tone={RESULT_TONE[c.result ?? ""] ?? "neutral"} />
            <div className="tl-time mono">{relTime(c.createdAt)}</div>
            <div className="tl-body">
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{headline}</div>
              {c.note && <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 1 }}>{c.note}</div>}
              <div className="muted" style={{ fontSize: 11 }}>{channel}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
