// CANDI — form-template field mapping: the data contract that makes a new form
// a DATA-ONLY addition (a form_templates row), never new code.
//
// A mapping is stored as jsonb on form_templates:
//   { mode: "acroform" | "stamp", fields: [{ source, target }] }
//
// • mode "acroform" — target is the PDF's AcroForm field NAME; the engine fills
//   the field and flattens (used by the official FL DS-DE 160, which ships with
//   72 named fields).
// • mode "stamp"    — target is { page, x, y, size? } in PDF points (origin
//   bottom-left); the engine draws text directly for flat scans with no fields
//   (the path Harrison's own form takes if it arrives as a flat PDF).
//
// Sources are derived from the voters table columns that actually exist
// (first_name, last_name, address, city, state, zip, phone, email,
// mailing_address, precinct). DOB and signature are deliberately NOT mappable:
// the voter completes those by hand.

export type StampTarget = {
  /** 0-based page index within one copy of the template. */
  page: number;
  x: number;
  y: number;
  /** Font size in points; defaults to 10. */
  size?: number;
};

export type FieldSource =
  | "first_name"
  | "last_name"
  | "full_name"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "city_state_zip"
  | "phone"
  | "email"
  | "precinct"
  | "date_today"
  /** Full one-line mailing address, only when it differs from the residence. */
  | "mailing_address"
  /** Parsed pieces of mailing_address ("street, city, ST zip"), same guard. */
  | "mailing_street"
  | "mailing_city"
  | "mailing_state"
  | "mailing_zip";

export type MappingField = {
  source: FieldSource;
  /** AcroForm field name (mode "acroform") or stamp coordinates (mode "stamp"). */
  target: string | StampTarget;
};

export type FormMapping = {
  mode: "acroform" | "stamp";
  fields: MappingField[];
};

/** The voter columns the fill engine reads (subset of public.voters). */
export type FormVoter = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  mailing_address: string | null;
  precinct: string | null;
};

/**
 * Same-place heuristic as the Voters page: tokenize the mailing STREET (before
 * the first comma) and the residence street; treat them as the same place when
 * one token list is a prefix of the other (absorbs unit-suffix differences).
 */
function sameAddress(mailing: string | null, residence: string | null): boolean {
  const toks = (s: string | null) =>
    (s ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  const a = toks((mailing ?? "").split(",")[0]);
  const b = toks(residence);
  if (a.length === 0 || b.length === 0) return false;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** "123 NW 4 St, Lauderdale Lakes, FL 33311" → { street, city, state, zip }. */
function parseMailing(mailing: string): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const parts = mailing.split(",").map((p) => p.trim());
  const street = parts[0] ?? "";
  const city = parts[1] ?? "";
  const stateZip = (parts[2] ?? "").split(/\s+/).filter(Boolean);
  const state = stateZip[0] ?? "";
  const zip = stateZip.slice(1).join(" ");
  return { street, city, state, zip };
}

/**
 * Resolve one mapping source to the string that goes on the form. Returns ""
 * when the voter has no value (the engine then leaves the field blank).
 * Mailing sources resolve to "" when the mailing address is absent OR is the
 * same place as the residence — the form's mailing block stays empty and the
 * SOE mails to the residence on file.
 */
export function resolveSource(voter: FormVoter, source: FieldSource): string {
  const t = (s: string | null | undefined) => (s ?? "").trim();
  switch (source) {
    case "first_name":
      return t(voter.first_name);
    case "last_name":
      return t(voter.last_name);
    case "full_name":
      return [t(voter.first_name), t(voter.last_name)].filter(Boolean).join(" ");
    case "address":
      return t(voter.address);
    case "city":
      return t(voter.city);
    case "state":
      return t(voter.state);
    case "zip":
      return t(voter.zip);
    case "city_state_zip":
      return [t(voter.city), [t(voter.state), t(voter.zip)].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
    case "phone":
      return t(voter.phone);
    case "email":
      return t(voter.email);
    case "precinct":
      return t(voter.precinct);
    case "date_today": {
      const d = new Date();
      return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(
        2,
        "0"
      )}/${d.getFullYear()}`;
    }
    case "mailing_address":
    case "mailing_street":
    case "mailing_city":
    case "mailing_state":
    case "mailing_zip": {
      const mailing = t(voter.mailing_address);
      if (!mailing || sameAddress(mailing, voter.address)) return "";
      if (source === "mailing_address") return mailing;
      const parsed = parseMailing(mailing);
      if (source === "mailing_street") return parsed.street;
      if (source === "mailing_city") return parsed.city;
      if (source === "mailing_state") return parsed.state;
      return parsed.zip;
    }
  }
}

/** Runtime validation for mapping jsonb loaded from the DB. */
export function isFormMapping(value: unknown): value is FormMapping {
  if (typeof value !== "object" || value === null) return false;
  const m = value as { mode?: unknown; fields?: unknown };
  if (m.mode !== "acroform" && m.mode !== "stamp") return false;
  if (!Array.isArray(m.fields)) return false;
  return m.fields.every((f) => {
    if (typeof f !== "object" || f === null) return false;
    const { source, target } = f as { source?: unknown; target?: unknown };
    if (typeof source !== "string") return false;
    if (typeof target === "string") return true;
    if (typeof target !== "object" || target === null) return false;
    const s = target as StampTarget;
    return typeof s.page === "number" && typeof s.x === "number" && typeof s.y === "number";
  });
}
