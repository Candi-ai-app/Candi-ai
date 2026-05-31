// lib/areas.ts — curated DEMO reference for the new-campaign onboarding wizard.
//
// This is hand-authored demo data: a small tree of State → County → District/Office
// plus a rough geographic bbox, a set of precinct labels, and a representative
// city / zip for each county. It exists so the onboarding flow can (a) drive the
// State/County/District picklists and (b) generate a plausible, geographically
// sensible sample voter set the moment a campaign is created.
//
// Real areas (every county, real precinct splits, true geocodes) arrive with the
// voter-file import feature — at which point this file is replaced by live data.

/** [west, south, east, north] in lng/lat — used to scatter sample voter points. */
export type BBox = [number, number, number, number];

export type AreaCounty = {
  county: string;
  /** Districts / offices a campaign in this county might run for. */
  districts: string[];
  /** Representative city for synthetic voter addresses. */
  city: string;
  /** ZIP codes seen in this city, for synthetic addresses. */
  zips: string[];
  /** Precinct labels in this county's local style (e.g. "K006", "07N"). */
  precincts: string[];
  /** Rough bounding box to place synthetic voter points within. */
  bbox: BBox;
  /** Street names for synthetic addresses (flavor only). */
  streets: string[];
};

export type AreaState = {
  state: string;
  /** USPS abbreviation, stored on each voter row. */
  abbr: string;
  counties: AreaCounty[];
};

export const AREAS: AreaState[] = [
  {
    state: "Florida",
    abbr: "FL",
    counties: [
      {
        county: "Broward County",
        districts: ["County Commission District 9", "FL Senate District 35"],
        city: "Lauderdale Lakes",
        zips: ["33309", "33311", "33313", "33319", "33351"],
        // Broward "K"-style precinct labels.
        precincts: ["K006", "K012", "K018", "K024", "K031", "K037", "K044", "K052"],
        bbox: [-80.4, 26.05, -80.1, 26.3],
        streets: [
          "NW 31st Ave",
          "Oakland Park Blvd",
          "NW 19th St",
          "State Road 7",
          "NW 44th St",
          "W Commercial Blvd",
          "NW 21st Ave",
          "Somerset Dr",
          "NW 49th Ave",
          "NW 38th St",
        ],
      },
      {
        county: "Miami-Dade County",
        districts: ["FL House District 113", "Miami-Dade Commission District 5"],
        city: "Miami",
        zips: ["33125", "33127", "33130", "33135", "33142"],
        precincts: ["536", "541", "549", "552", "560", "567", "573", "581"],
        bbox: [-80.32, 25.72, -80.13, 25.86],
        streets: [
          "NW 7th St",
          "SW 8th St",
          "Flagler St",
          "NW 27th Ave",
          "Coral Way",
          "NW 17th Ave",
          "SW 22nd St",
          "NW 36th St",
          "NW 12th Ave",
          "SW 1st St",
        ],
      },
    ],
  },
  {
    state: "Pennsylvania",
    abbr: "PA",
    counties: [
      {
        county: "Allegheny County",
        districts: ["PA Senate District 12"],
        city: "Pittsburgh",
        zips: ["15213", "15217", "15206", "15203", "15219", "15232", "15224"],
        precincts: ["07N", "12S", "03W", "14E", "05N", "09S", "11W", "16E"],
        bbox: [-80.1, 40.36, -79.86, 40.52],
        streets: [
          "Penn Ave",
          "Forbes Ave",
          "Liberty Ave",
          "Negley Ave",
          "Highland Ave",
          "Murray Ave",
          "Carson St",
          "Butler St",
          "Walnut St",
          "Centre Ave",
        ],
      },
      {
        county: "Philadelphia County",
        districts: ["PA House District 182", "Philadelphia City Council District 5"],
        city: "Philadelphia",
        zips: ["19102", "19103", "19106", "19107", "19123", "19130"],
        precincts: ["08-01", "08-04", "15-02", "15-09", "30-03", "30-11", "12-06", "12-14"],
        bbox: [-75.21, 39.92, -75.13, 40.0],
        streets: [
          "Market St",
          "Chestnut St",
          "Walnut St",
          "Spring Garden St",
          "Spruce St",
          "Arch St",
          "Race St",
          "S Broad St",
          "Girard Ave",
          "Fairmount Ave",
        ],
      },
    ],
  },
];

/** Look up a county within a state from the curated tree. */
export function findArea(state: string, county: string): AreaCounty | null {
  const s = AREAS.find((a) => a.state === state);
  if (!s) return null;
  return s.counties.find((c) => c.county === county) ?? null;
}

/** USPS abbreviation for a state name, or "" if unknown. */
export function stateAbbr(state: string): string {
  return AREAS.find((a) => a.state === state)?.abbr ?? "";
}

/** Number of sample voters the wizard creates per campaign (shown in the UI). */
export const SAMPLE_VOTER_COUNT = 600;
