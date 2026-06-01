"use client";

/* Client islands for the sign-in page. The page itself stays a Server Component
   so the real Supabase auth (signIn/signUp server actions via <button formAction>)
   and the ?error= banner keep working with no client JS in the critical path.
   These islands layer in just the interactive pieces:
     • PasswordField — real show/hide eye toggle inside the input (matches design)
     • GoogleButton  — visual "Continue with Google"; no OAuth callback route
                       exists in the app, so it surfaces an inline note instead
                       of silently doing nothing or building new OAuth infra.
     • ResetLink     — visual "Reset password"; no reset route exists, so it
                       surfaces an inline note.
     • HeroPanel     — non-interactive Leaflet dark CARTO map of Lauderdale Lakes
                       behind CSS turf zones / pins / testimonials, plus an
                       entrance-animation safety net for throttled tabs. */

import { useEffect, useRef, useState } from "react";
import { EYE, EYE_OFF, GOOGLE } from "./icons";

/** Password input with the show/hide eye INSIDE the input (design's .inp.pw). */
export function PasswordField() {
  const [show, setShow] = useState(false);
  return (
    <div className="inp pw">
      <input
        id="password"
        name="password"
        type={show ? "text" : "password"}
        placeholder="Enter your password"
        autoComplete="current-password"
        required
        minLength={10}
      />
      <button
        type="button"
        className="eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? EYE_OFF : EYE}
      </button>
    </div>
  );
}

/** "Continue with Google" — visual fidelity; no OAuth callback route exists. */
export function GoogleButton() {
  const [noted, setNoted] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-google si-el si-d9"
        onClick={() => setNoted(true)}
        aria-describedby={noted ? "google-note" : undefined}
      >
        <span aria-hidden="true">{GOOGLE}</span> Continue with Google
      </button>
      {noted && (
        <p className="note" id="google-note" role="status">
          Google sign-in isn’t enabled yet — use your email and password above.
        </p>
      )}
    </>
  );
}

/** "Reset password" — visual fidelity; no password-reset route exists. */
export function ResetLink() {
  const [noted, setNoted] = useState(false);
  return (
    <button
      type="button"
      className="link"
      onClick={() => setNoted(true)}
      aria-describedby={noted ? "reset-note" : undefined}
    >
      {noted ? "Contact your campaign admin" : "Reset password"}
    </button>
  );
}

/* Latitude/longitude for Lauderdale Lakes, FL (matches the landing's backdrop). */
const CENTER: [number, number] = [26.1653, -80.2078];
const ZOOM = 14;

/** Right-side hero panel: Leaflet dark map + CSS turf zones, pins, testimonials. */
export function HeroPanel() {
  const mapElRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  // ── Leaflet backdrop — Lauderdale Lakes (dark CARTO, fully non-interactive) ──
  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;
    let map: import("leaflet").LeafletMap | null = null;
    let cancelled = false;
    const timers: number[] = [];
    let fix: (() => void) | null = null;

    import("leaflet").then((mod) => {
      const L = mod.default;
      if (cancelled || !el) return;
      map = L.map(el, {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView(CENTER, ZOOM);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "© OpenStreetMap · © CARTO",
      }).addTo(map);
      fix = () => map?.invalidateSize(false);
      timers.push(window.setTimeout(fix, 120), window.setTimeout(fix, 600));
      window.addEventListener("resize", fix);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (fix) window.removeEventListener("resize", fix);
      if (map) map.remove();
    };
  }, []);

  // ── Entrance-animation safety net: if the tab was backgrounded and the CSS
  //    animations were throttled, force anything still invisible to show. ──
  useEffect(() => {
    const root = rootRef.current?.closest(".signin");
    if (!root) return;
    const t = window.setTimeout(() => {
      root.querySelectorAll<HTMLElement>(".si-el, .si-slide, .si-tin").forEach((node) => {
        if (parseFloat(getComputedStyle(node).opacity) < 0.99) {
          node.style.opacity = "1";
          node.style.filter = "none";
          node.style.transform = "none";
        }
      });
    }, 2600);
    return () => clearTimeout(t);
  }, []);

  return (
    <aside className="heroside" ref={rootRef}>
      <div className="panel si-slide si-d3">
        <div className="map" ref={mapElRef} />
        <div className="map-veil" />
        <div className="z" style={{ left: "9%", top: "30%", width: "26%", height: "34%" }} />
        <div className="z" style={{ left: "60%", top: "24%", width: "24%", height: "30%" }} />
        <div className="z b" style={{ left: "38%", top: "60%", width: "22%", height: "24%" }} />
        <span className="pin" style={{ left: "18%", top: "44%" }} />
        <span className="pin" style={{ left: "28%", top: "54%" }} />
        <span className="pin" style={{ left: "69%", top: "34%" }} />
        <span className="pin" style={{ left: "46%", top: "68%" }} />
        <span className="tag">Field organizing, ground up</span>
        <div className="ph">Your district, organized.</div>
        <div className="tests">
          <div className="tcard si-tin si-d10">
            <div className="av">DR</div>
            <div className="tx">
              <b>Dana Reyes</b>
              <span className="h">Field Dir · State Senate 14</span>
              We cut turf in minutes, not nights — canvassers finally knew exactly where to go.
            </div>
          </div>
          <div className="tcard si-tin si-d12">
            <div className="av">PM</div>
            <div className="tx">
              <b>Priya Menon</b>
              <span className="h">Campaign Mgr · District 7</span>
              Set up in a day. We hit our door goals two weeks early.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
