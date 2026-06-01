/* Inline SVG icons for the sign-in page, ported verbatim from the source design's
   inline <script> (the brand pin mark, the multi-color Google "G", and the
   eye / eye-off toggle glyphs). Kept as plain JSX so both server and client
   components can render them. */

import type { ReactElement } from "react";

/** Brand mark — a map pin with an inset "card", matching the landing's PIN. */
export const PIN: ReactElement = (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M24 7 C15.7 7 10 13 10 20.4 C10 30.6 24 42 24 42 C24 42 38 30.6 38 20.4 C38 13 32.3 7 24 7 Z"
      stroke="currentColor"
      strokeWidth="3.6"
      strokeLinejoin="round"
    />
    <rect x="17" y="14" width="14" height="13" rx="3.4" stroke="currentColor" strokeWidth="3" />
    <circle cx="24" cy="20.5" r="2.4" fill="currentColor" />
  </svg>
);

/** Google "G" mark (full color), as in the source design. */
export const GOOGLE: ReactElement = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.917z"
    />
  </svg>
);

/** Eye (password visible) — matches the design's EYE glyph. */
export const EYE: ReactElement = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Eye-off (password hidden) — matches the design's EYEOFF glyph. */
export const EYE_OFF: ReactElement = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 2.83M6.1 6.1A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 4-.9" />
    <path d="m2 2 20 20M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
