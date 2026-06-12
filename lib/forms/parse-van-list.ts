// CANDI — VAN PDF list parser (stub, wired for a later milestone).
//
// Campaigns coming off VAN often only have their walk/call lists as PDFs. This
// module will turn an uploaded VAN list PDF into rows we can match against the
// campaign's voters (by VANID when present, else name + address) so a form
// batch can be generated straight from "the list the consultant sent over".
//
// unpdf is installed and imported here so the dependency ships now; the actual
// column parsing lands with the upload UI.

import { extractText, getDocumentProxy } from "unpdf";

/** One voter row recovered from a VAN-exported PDF list. */
export type ParsedVanVoter = {
  /** VAN "Voter File VANID" when the list includes it (joins voters.vanid). */
  vanid: string | null;
  name: string | null;
  address: string | null;
  /** Raw source line, kept for match debugging / manual review. */
  raw: string;
};

export type ParsedVanList = {
  voters: ParsedVanVoter[];
  pageCount: number;
  /** Lines we could not confidently parse (surfaced for manual review). */
  unparsed: string[];
};

/**
 * Parse a VAN list PDF into voter rows.
 *
 * TODO(forms-v2): implement the real parser —
 *   1. detect the list flavor (walk list / call list / StandardText export)
 *      from the header line;
 *   2. split each page's text into voter blocks (VANID anchors when present,
 *      else name-line heuristics);
 *   3. return rows ready for matching against public.voters (vanid first,
 *      then name + address fallback).
 *
 * For now it only extracts the text layer and reports page count, returning
 * every line as unparsed so callers can build review UI against real shapes.
 */
export async function parseVanListPdf(bytes: Uint8Array): Promise<ParsedVanList> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { voters: [], pageCount: totalPages, unparsed: lines };
}
