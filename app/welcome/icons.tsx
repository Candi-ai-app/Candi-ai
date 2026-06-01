/* Geometric icon set for the landing page (/welcome) — ported from the design's
   inline svg() helper. Each is a 24×24 stroked glyph using currentColor. */
import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const ModuleIcons = {
  voters: (
    <Svg>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.6-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 9h5M18.5 6.5v5" />
    </Svg>
  ),
  turf: (
    <Svg>
      <path d="M9 3 4 5v16l5-2 6 2 5-2V3l-5 2-6-2Z" />
      <path d="M9 3v16M15 5v16" />
    </Svg>
  ),
  scripts: (
    <Svg>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Svg>
  ),
  texting: (
    <Svg>
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />
      <path d="M9 11h.01M13 11h.01" />
    </Svg>
  ),
  hq: (
    <Svg>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
      <path d="M4 20h16" />
    </Svg>
  ),
} as const;
