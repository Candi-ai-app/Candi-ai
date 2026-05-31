// lib/elections.ts — recent-election reference for the super-voter filter.
//
// SIMPLIFIED (no separate `elections` table): per-election vote history lives in
// `voters.vote_history.history` as a `{ "<code>": boolean }` map. This module is
// the single source of truth for which elections are "recent" and their order
// (most-recent-first), so "voted in at least N of the last M" is well-defined.
//
// The N-of-M filter runs client-side on the loaded voter set (consistent with the
// current data-derived filter architecture). Server-side counting is the scale
// path for 400k+ voters and is out of scope here.

export type Election = { code: string; label: string };

/** Recent elections, ordered MOST-RECENT-FIRST. "last M" = the first M of these. */
export const RECENT_ELECTIONS: Election[] = [
  { code: "2024G", label: "2024 General" },
  { code: "2022G", label: "2022 General" },
  { code: "2020G", label: "2020 General" },
  { code: "2018G", label: "2018 General" },
];

/** Total number of recent elections tracked (the max M). */
export const MAX_M = RECENT_ELECTIONS.length;

export type VoteHistoryMap = Record<string, boolean>;

/**
 * Count of elections voted (`true`) among the most-recent `m` elections.
 * Looks up the first `m` codes from RECENT_ELECTIONS in the given history map.
 */
export function voteCount(history: VoteHistoryMap | null | undefined, m: number): number {
  if (!history) return 0;
  const take = Math.max(0, Math.min(m, RECENT_ELECTIONS.length));
  let n = 0;
  for (let i = 0; i < take; i++) {
    if (history[RECENT_ELECTIONS[i].code] === true) n++;
  }
  return n;
}

/** Convenience label, e.g. "75% (3/4)", from a per-election history map over M. */
export function historyLabel(history: VoteHistoryMap | null | undefined, m: number = RECENT_ELECTIONS.length): string {
  const got = voteCount(history, m);
  const pct = m > 0 ? Math.round((got / m) * 100) : 0;
  return `${pct}% (${got}/${m})`;
}
