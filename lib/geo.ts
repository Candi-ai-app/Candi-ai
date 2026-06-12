/**
 * lib/geo.ts — County-based map geography helpers.
 *
 * Maps a campaign's county (and optionally state) to an initial map center and
 * zoom level. County values in the DB are inconsistent: some rows say "Broward",
 * others "Broward County" — this module normalises both forms.
 *
 * Fallback: any unrecognised county/state returns the Broward center that was
 * hardcoded before this change, so existing demo campaigns remain pixel-perfect.
 *
 * County-slug-to-GeoJSON-asset: `countyPrecinctAsset(county)` returns the path
 * under /geo/ for the county's precinct boundary file, or null if no asset
 * exists for that county. Currently only Broward has a deployed asset.
 */

export type GeoCenter = {
  center: [number, number]; // [lng, lat]
  zoom: number;
};

/** Canonical Broward coordinates (the historic hardcoded value). */
const BROWARD: GeoCenter = { center: [-80.2064, 26.1645], zoom: 11 };

/** Map from a normalised county slug to its center/zoom. */
const COUNTY_GEO: Record<string, GeoCenter> = {
  broward:      { center: [-80.2064, 26.1645], zoom: 11 },
  "miami-dade": { center: [-80.22,   25.79],   zoom: 10 },
  allegheny:    { center: [-79.98,   40.44],   zoom: 11 },
  philadelphia: { center: [-75.165,  39.95],   zoom: 12 },
};

/**
 * Counties that have a deployed precinct GeoJSON asset under /geo/.
 * Asset filename convention: `<slug>-precincts-2026.json`.
 */
const COUNTIES_WITH_PRECINCT_ASSET: ReadonlySet<string> = new Set(["broward"]);

/** Normalise a raw DB county value ("Broward County" → "broward"). */
function countySlug(county: string | null | undefined): string {
  if (!county) return "";
  return county
    .toLowerCase()
    .replace(/\s+county$/i, "") // strip trailing " county"
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Return the center + zoom for a campaign's county.
 * Falls back to Broward if the county is null, empty, or unrecognised.
 */
export function campaignGeo(county: string | null | undefined): GeoCenter {
  const slug = countySlug(county);
  return COUNTY_GEO[slug] ?? BROWARD;
}

/**
 * Return the public /geo/ path for a county's precinct boundary asset, or null
 * if no asset is deployed for that county. When null the Precincts toggle
 * should be hidden rather than fetching a missing file.
 *
 * For Broward the path resolves to `/geo/broward-precincts-2026.json` — exactly
 * the same URL that was hardcoded before this change, so Broward campaigns are
 * unaffected.
 */
export function countyPrecinctAsset(county: string | null | undefined): string | null {
  const slug = countySlug(county);
  if (!slug || !COUNTIES_WITH_PRECINCT_ASSET.has(slug)) return null;
  return `/geo/${slug}-precincts-2026.json`;
}

/**
 * Human-readable county label for UI copy ("Broward County", "Miami-Dade County").
 * Strips nothing — just title-cases the raw DB value if it doesn't already end
 * with "County". Used for the Precincts button tooltip.
 */
export function countyLabel(county: string | null | undefined): string {
  if (!county) return "County";
  const trimmed = county.trim();
  if (/county$/i.test(trimmed)) return trimmed;
  return `${trimmed} County`;
}
