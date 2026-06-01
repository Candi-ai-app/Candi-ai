"use client";

/* Candi marketing landing page — PUBLIC route at /welcome (outside the (app) auth
   group; no login required). Recreates the source design at high fidelity:
   nav, 3D container-scroll hero card, trust strip, 5 module cards, scroll-reveal
   Leaflet map, tabbed app peek, integrations orbit, dark security section,
   pricing, FAQ accordion, gooey pixel-trail CTA, footer.

   All styles are scoped under the `.lp` root class (see landing.css) so the
   design's generic class names (.nav/.btn/.brand/.dot/.app…) never collide with
   the app's globals.css. The inline scroll/tilt/gooey scripts are ported to
   React effects (useEffect + rAF). */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./landing.css";
import { AppScreen, PIN, type ScreenName } from "./mocks";
import { ModuleIcons, SecurityIcons } from "./icons";

const LOGIN = "/login";

export default function WelcomePage() {
  const [peek, setPeek] = useState<ScreenName>("voters");

  const figureRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mapTransformRef = useRef<HTMLDivElement>(null);
  const leafletElRef = useRef<HTMLDivElement>(null);
  const pxHostRef = useRef<HTMLDivElement>(null);
  const pxBoxRef = useRef<HTMLDivElement>(null);

  // ── Leaflet backdrop — Lauderdale Lakes, FL (dark CARTO, non-interactive) ──
  useEffect(() => {
    const el = leafletElRef.current;
    if (!el) return;
    let map: import("leaflet").LeafletMap | null = null;
    let cancelled = false;
    const fixes: number[] = [];

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
      }).setView([26.1653, -80.2078], 14);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "© OpenStreetMap · © CARTO",
      }).addTo(map);
      const fix = () => map?.invalidateSize(false);
      fixes.push(window.setTimeout(fix, 120), window.setTimeout(fix, 600));
      window.addEventListener("resize", fix);
      // store off so cleanup can remove the same handler
      (map as unknown as { __fix?: () => void }).__fix = fix;
    });

    return () => {
      cancelled = true;
      fixes.forEach(clearTimeout);
      if (map) {
        const fix = (map as unknown as { __fix?: () => void }).__fix;
        if (fix) window.removeEventListener("resize", fix);
        map.remove();
      }
    };
  }, []);

  // ── ContainerScroll hero tilt — card flattens + scales; headline parallax ──
  useEffect(() => {
    const fig = figureRef.current;
    const card = cardRef.current;
    const copy = copyRef.current;
    if (!fig || !card) return;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    let mobile = window.matchMedia("(max-width:768px)").matches;
    let ticking = false;

    const settle = () => {
      // reduced-motion: render the settled (flat) state, no scroll coupling
      card.style.transform = "rotateX(0deg) scale(1)";
      if (copy) copy.style.transform = "translateY(0)";
    };

    const update = () => {
      ticking = false;
      const rect = fig.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      const start = vh * 0.95;
      const end = vh * 0.38;
      const p = Math.min(Math.max((start - center) / (start - end), 0), 1);
      const rot = lerp(20, 0, p);
      const sc = mobile ? lerp(0.7, 0.9, p) : lerp(1.05, 1, p);
      card.style.transform = `rotateX(${rot}deg) scale(${sc})`;
      if (copy) copy.style.transform = `translateY(${lerp(0, -50, p)}px)`;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settle();
      return;
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    const onResize = () => {
      mobile = window.matchMedia("(max-width:768px)").matches;
      update();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // ── Scroll-reveal — clip-path opens the map; map scales down as you scroll ──
  useEffect(() => {
    const sec = revealRef.current;
    const track = trackRef.current;
    const panel = panelRef.current;
    const map = mapTransformRef.current;
    if (!sec || !track || !panel || !map) return;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    let ticking = false;

    const update = () => {
      ticking = false;
      const revH = track.offsetHeight - window.innerHeight;
      const top = sec.getBoundingClientRect().top;
      const scrolled = Math.min(Math.max(-top, 0), revH);
      const p = revH > 0 ? scrolled / revH : 0;
      const cs = lerp(25, 0, p);
      const ce = lerp(75, 100, p);
      panel.style.clipPath = `polygon(${cs}% ${cs}%,${ce}% ${cs}%,${ce}% ${ce}%,${cs}% ${ce}%)`;
      const sp = Math.min(scrolled / (revH + 300), 1);
      map.style.transform = `scale(${lerp(1.7, 1, sp)})`;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // open the panel fully and settle the map
      panel.style.clipPath = "polygon(0% 0%,100% 0%,100% 100%,0% 100%)";
      map.style.transform = "scale(1)";
      return;
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);

  // ── Gooey pixel trail — pointer lights cells that fade out, behind goo filter ──
  useEffect(() => {
    const host = pxHostRef.current;
    const box = pxBoxRef.current;
    if (!host || !box) return;
    const SIZE = 30;
    let cols = 0;
    let rows = 0;

    const build = () => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      cols = Math.ceil(w / SIZE);
      rows = Math.ceil(h / SIZE);
      host.innerHTML = "";
      for (let y = 0; y < rows; y++) {
        const row = document.createElement("div");
        row.className = "pxrow";
        for (let x = 0; x < cols; x++) {
          const d = document.createElement("div");
          d.className = "px";
          d.style.width = `${SIZE}px`;
          d.style.height = `${SIZE}px`;
          row.appendChild(d);
        }
        host.appendChild(row);
      }
    };

    const lightAt = (clientX: number, clientY: number) => {
      const r = host.getBoundingClientRect();
      const x = Math.floor((clientX - r.left) / SIZE);
      const y = Math.floor((clientY - r.top) / SIZE);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const rowEl = host.children[y] as HTMLElement | undefined;
      if (!rowEl) return;
      const cell = rowEl.children[x] as HTMLElement | undefined;
      if (!cell) return;
      cell.style.transition = "none";
      cell.style.opacity = "1";
      requestAnimationFrame(() => {
        cell.style.transition = "opacity .6s ease";
        cell.style.opacity = "0";
      });
    };

    const onMove = (e: PointerEvent) => lightAt(e.clientX, e.clientY);
    box.addEventListener("pointermove", onMove);
    build();
    window.addEventListener("resize", build);
    return () => {
      box.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", build);
    };
  }, []);

  const PEEK_TABS: { id: ScreenName; label: string }[] = [
    { id: "voters", label: "Voters" },
    { id: "turf", label: "Turf" },
    { id: "texting", label: "Texting" },
    { id: "hq", label: "HQ" },
  ];

  return (
    <div className="lp">
      {/* gooey SVG filter def (scoped id) */}
      <svg className="goo-defs" aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="candi-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* NAV */}
      <header className="nav">
        <div className="wrap row">
          <a className="brand" href="#top">
            <span className="bm">{PIN}</span> Candi<span className="dot">.</span>
          </a>
          <nav className="links">
            <a href="#product">Product</a>
            <a href="#peek">Platform</a>
            <a href="#security">Security</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="right">
            <Link className="login" href={LOGIN}>
              Log in
            </Link>
            <Link className="btn btn-primary" href={LOGIN}>
              Book a demo
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="wrap grid">
          <div className="copy" ref={copyRef}>
            <div className="eyebrow-row">
              <span className="eyebrow">Nonpartisan · AI-native campaign OS</span>
              <span className="tagchip">Field organizing, ground up</span>
            </div>
            <h1 className="h1">Run your whole campaign from one screen.</h1>
            <p className="sub">
              Candi is the nonpartisan, AI-native campaign OS — voter targeting, turf-cutting, canvassing,
              texting, and a live HQ in one place. Built for local and down-ballot campaigns, not just the
              statewide machine.
            </p>
            <div className="cta-row">
              <Link className="btn btn-primary btn-lg" href={LOGIN}>
                Book a demo <span className="arr">→</span>
              </Link>
              <a className="btn btn-ghost btn-lg" href="#peek">
                See the platform
              </a>
            </div>
            <div className="cta-note">
              <span className="d" /> No VAN gatekeeping · set up in a day · your data stays yours
            </div>
          </div>
          <div className="figure cs-figure" ref={figureRef}>
            <div className="glow" />
            <div className="cs-card" ref={cardRef} aria-label="Candi HQ">
              <div className="scr">
                <div className="screen">
                  <AppScreen name="hq" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="trust">
        <div className="wrap">
          <div className="lab">Powering campaigns &amp; committees in 28 states</div>
          <div className="logos">
            <span>Mayoral &apos;26</span>
            <span>State Senate 14</span>
            <span>Yes on 3</span>
            <span>County Forward</span>
            <span>District 7</span>
            <span>Civic Action</span>
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section className="sec modules" id="product">
        <div className="wrap">
          <div className="sec-head">
            <span className="kick eyebrow">
              <span className="dot" /> One platform, five jobs
            </span>
            <h2 className="sec-title">Every part of field, finally connected.</h2>
            <p className="sec-sub">
              Stop stitching together a spreadsheet, a texting tool, and a clipboard. Candi runs targeting
              through turnout on one shared source of truth.
            </p>
          </div>
          <div className="grid">
            <article className="mod">
              <div className="ic">{ModuleIcons.voters}</div>
              <h3>Voters</h3>
              <p>Modeled support &amp; turnout scores on every voter. Build segments in seconds, not SQL.</p>
              <div className="mini">
                <div className="mini-rows">
                  <div className="r a" />
                  <div className="r b" />
                  <div className="r a" />
                  <div className="r" />
                </div>
              </div>
            </article>
            <article className="mod">
              <div className="ic">{ModuleIcons.turf}</div>
              <h3>Turf</h3>
              <p>Cut balanced walk lists by the numbers and hand them to canvassers on any phone.</p>
              <div className="mini">
                <div className="mini-map">
                  <div className="zone" style={{ left: "14%", top: "20%", width: "40%", height: "46%" }} />
                  <div
                    className="zone"
                    style={{ left: "58%", top: "40%", width: "28%", height: "40%", borderStyle: "dashed", background: "none" }}
                  />
                </div>
              </div>
            </article>
            <article className="mod">
              <div className="ic">{ModuleIcons.scripts}</div>
              <h3>Scripts</h3>
              <p>Adaptive scripts that brief volunteers and capture clean data at the door.</p>
              <div className="mini">
                <div className="mini-rows">
                  <div className="r a" />
                  <div className="r" />
                  <div className="r b" />
                  <div className="r a" />
                </div>
              </div>
            </article>
            <article className="mod lg">
              <div className="ic">{ModuleIcons.texting}</div>
              <h3>Texting</h3>
              <p>
                Peer-to-peer and broadcast texting with compliance baked in — segment from the same voter file
                your canvassers use, and route replies to a real person.
              </p>
              <div className="mini">
                <div className="mini-chat">
                  <div className="bub in">Where&apos;s my polling place?</div>
                  <div className="bub out">Riverside Elementary, 7a–8p. Want a reminder?</div>
                </div>
              </div>
            </article>
            <article className="mod lg">
              <div className="ic">{ModuleIcons.hq}</div>
              <h3>HQ</h3>
              <p>
                A live command center: doors knocked, texts sent, modeled turnout lift, and volunteer activity
                updating in real time — so you can move resources where they&apos;ll win votes.
              </p>
              <div className="mini">
                <div className="mini-stat">
                  <div className="s">
                    <b>1,940</b>
                    <span>Doors today</span>
                  </div>
                  <div className="s">
                    <b>+4.2pt</b>
                    <span>Turnout lift</span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* SCROLL REVEAL */}
      <section className="reveal" id="reveal" ref={revealRef}>
        <div className="track" ref={trackRef}>
          <div className="sticky">
            <div className="panel" ref={panelRef}>
              <div className="map" ref={mapTransformRef}>
                <div className="leaflet-bg" ref={leafletElRef} />
                <div className="map-veil" />
                <div className="zones">
                  <div className="z" style={{ left: "11%", top: "28%", width: "25%", height: "36%" }} />
                  <div className="z" style={{ left: "60%", top: "22%", width: "23%", height: "32%" }} />
                  <div className="z b" style={{ left: "37%", top: "58%", width: "22%", height: "28%" }} />
                  <span className="pin" style={{ left: "19%", top: "42%" }} />
                  <span className="pin" style={{ left: "28%", top: "54%" }} />
                  <span className="pin" style={{ left: "68%", top: "33%" }} />
                  <span className="pin" style={{ left: "74%", top: "44%" }} />
                  <span className="pin" style={{ left: "45%", top: "66%" }} />
                </div>
              </div>
              <div className="overlay">
                <span className="eyebrow">Your district, live</span>
                <h2>Every door on the map. Every voter in reach.</h2>
                <p className="sub">
                  Candi turns your turf into a living map your whole team works from — scroll to open the field.
                </p>
              </div>
              <div className="hint">
                Scroll <span className="ar">↓</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BIG PEEK */}
      <section className="sec" id="peek">
        <div className="wrap">
          <div className="peek">
            <div className="ph">
              <div>
                <span className="kick eyebrow" style={{ color: "var(--accent-deep)" }}>
                  <span className="dot" /> The platform
                </span>
                <h2 className="sec-title">See the whole field operation.</h2>
                <p className="sec-sub">Click through the modules your team lives in every day.</p>
              </div>
              <div className="tabs">
                {PEEK_TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`tab ${peek === t.id ? "on" : ""}`}
                    onClick={() => setPeek(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stage">
              <AppScreen name={peek} />
            </div>
          </div>
        </div>
      </section>

      {/* DATA / INTEGRATIONS */}
      <section className="sec data">
        <div className="wrap">
          <div className="grid">
            <div>
              <span className="kick eyebrow">
                <span className="dot" /> Data &amp; integrations
              </span>
              <h2 className="sec-title">Bring your voter file. Keep your stack.</h2>
              <p className="sec-sub">
                Candi imports the L2 / state voter files you already use and syncs with the tools your campaign
                runs on — no rip-and-replace, no exports held hostage.
              </p>
              <div className="chips">
                <span className="c">
                  <span className="d" /> L2 &amp; state voter files
                </span>
                <span className="c">
                  <span className="d" /> ActBlue / WinRed
                </span>
                <span className="c">
                  <span className="d" /> Google &amp; Microsoft SSO
                </span>
                <span className="c">
                  <span className="d" /> Mailchimp
                </span>
                <span className="c">
                  <span className="d" /> Zapier
                </span>
                <span className="c">
                  <span className="d" /> CSV in &amp; out, anytime
                </span>
              </div>
            </div>
            <div className="orbit">
              <span className="ring" style={{ inset: "14%" }} />
              <span className="ring" style={{ inset: "30%" }} />
              <div className="core">{PIN}</div>
              <span className="node" style={{ top: "8%", left: "46%" }}>
                L2
              </span>
              <span className="node" style={{ top: "44%", left: "6%" }}>
                SSO
              </span>
              <span className="node" style={{ top: "44%", right: "6%" }}>
                AB
              </span>
              <span className="node" style={{ bottom: "10%", left: "24%" }}>
                CSV
              </span>
              <span className="node" style={{ bottom: "10%", right: "24%" }}>
                Zap
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section className="sec sec-dark" id="security">
        <div className="wrap">
          <div className="sec-head">
            <span className="kick eyebrow" style={{ color: "var(--accent)" }}>
              <span className="dot" /> Security &amp; compliance
            </span>
            <h2 className="sec-title">Built for the trust a campaign runs on.</h2>
            <p className="sec-sub">Voter data is sensitive and regulated. Candi treats it that way from day one.</p>
          </div>
          <div className="secgrid">
            <div className="scard">
              <div className="ic">{SecurityIcons.sc1}</div>
              <h4>SOC 2 Type II</h4>
              <p>Independently audited controls across security, availability, and confidentiality.</p>
            </div>
            <div className="scard">
              <div className="ic">{SecurityIcons.sc2}</div>
              <h4>Encrypted end to end</h4>
              <p>TLS in transit, AES-256 at rest. Field-level encryption on voter PII.</p>
            </div>
            <div className="scard">
              <div className="ic">{SecurityIcons.sc3}</div>
              <h4>Role-based access</h4>
              <p>Granular permissions and full audit logs — staff see only what their role allows.</p>
            </div>
            <div className="scard">
              <div className="ic">{SecurityIcons.sc4}</div>
              <h4>TCPA &amp; opt-out aware</h4>
              <p>Texting compliance, consent tracking, and suppression handled automatically.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="sec price" id="pricing">
        <div className="wrap">
          <div className="sec-head center">
            <span className="kick eyebrow">
              <span className="dot" /> Pricing
            </span>
            <h2 className="sec-title">Priced for the whole ballot.</h2>
            <p className="sec-sub">Local campaigns shouldn&apos;t pay statewide prices. Start free, scale when you do.</p>
          </div>
          <div className="grid">
            <div className="tier">
              <span className="pn">Local</span>
              <div className="amt">
                $0<small> / mo</small>
              </div>
              <p className="desc">For first-time and small down-ballot campaigns getting off the ground.</p>
              <ul>
                <li>
                  <span className="ck">✓</span> Up to 25,000 voters
                </li>
                <li>
                  <span className="ck">✓</span> Voters, Turf &amp; Scripts
                </li>
                <li>
                  <span className="ck">✓</span> 2 staff seats
                </li>
                <li>
                  <span className="ck">✓</span> CSV import / export
                </li>
              </ul>
              <Link className="btn btn-ghost" href={LOGIN}>
                Start free
              </Link>
            </div>
            <div className="tier feat">
              <span className="ftag">Most popular</span>
              <span className="pn">Campaign</span>
              <div className="amt">
                $390<small> / mo</small>
              </div>
              <p className="desc">For competitive local and legislative races running a real field program.</p>
              <ul>
                <li>
                  <span className="ck">✓</span> Unlimited voters in-district
                </li>
                <li>
                  <span className="ck">✓</span> Everything in Local + Texting &amp; HQ
                </li>
                <li>
                  <span className="ck">✓</span> Unlimited staff &amp; volunteers
                </li>
                <li>
                  <span className="ck">✓</span> Candi AI targeting &amp; scripts
                </li>
                <li>
                  <span className="ck">✓</span> Integrations &amp; SSO
                </li>
              </ul>
              <Link className="btn btn-primary" href={LOGIN}>
                Book a demo
              </Link>
            </div>
            <div className="tier">
              <span className="pn">Committee</span>
              <div className="amt">Custom</div>
              <p className="desc">For party committees and PACs running many campaigns at once.</p>
              <ul>
                <li>
                  <span className="ck">✓</span> Multi-campaign workspaces
                </li>
                <li>
                  <span className="ck">✓</span> Shared data &amp; turf across races
                </li>
                <li>
                  <span className="ck">✓</span> SOC 2 report &amp; DPA
                </li>
                <li>
                  <span className="ck">✓</span> Dedicated support
                </li>
              </ul>
              <Link className="btn btn-ghost" href={LOGIN}>
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec faq" id="faq">
        <div className="wrap">
          <div className="sec-head center">
            <span className="kick eyebrow">
              <span className="dot" /> FAQ
            </span>
            <h2 className="sec-title">Questions, answered.</h2>
          </div>
          <div className="grid">
            <details className="qa" open>
              <summary>
                Is Candi really nonpartisan?<span className="pm">+</span>
              </summary>
              <div className="a">
                Yes. Candi is infrastructure, not a side. Any campaign, committee, or advocacy org can use it —
                your data is yours, and we never share it across customers.
              </div>
            </details>
            <details className="qa">
              <summary>
                Do I need a voter file already?<span className="pm">+</span>
              </summary>
              <div className="a">
                No. We help you license and import an L2 or state voter file during onboarding, or you can bring
                one you already have. Imports usually take minutes.
              </div>
            </details>
            <details className="qa">
              <summary>
                How is this different from VAN?<span className="pm">+</span>
              </summary>
              <div className="a">
                Candi is built for local and down-ballot campaigns that VAN&apos;s access model and pricing leave
                behind. Everything — targeting, turf, texting, and HQ — lives in one modern, fast interface, and
                setup takes a day, not a quarter.
              </div>
            </details>
            <details className="qa">
              <summary>
                What does &quot;AI-native&quot; actually mean here?<span className="pm">+</span>
              </summary>
              <div className="a">
                Candi AI scores persuadability and turnout, drafts canvassing and texting scripts, and suggests
                where to move resources — all grounded in your campaign&apos;s own data, with a human always in
                control.
              </div>
            </details>
            <details className="qa">
              <summary>
                Can volunteers use it without training?<span className="pm">+</span>
              </summary>
              <div className="a">
                Yes. Canvassers get a phone-first walk list and adaptive script; texters get a clean reply inbox.
                Most volunteers are productive within their first shift.
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final" id="demo">
        <div className="wrap">
          <div className="box" ref={pxBoxRef}>
            <div className="pxwrap">
              <div className="pxtrail" ref={pxHostRef} />
            </div>
            <div className="glow2" />
            <h2>See Candi on your race.</h2>
            <p>A 30-minute demo on your district, your voter file, your ballot. No commitment.</p>
            <div className="cta-row">
              <Link className="btn btn-primary btn-lg" href={LOGIN}>
                Book a demo <span className="arr">→</span>
              </Link>
              <Link
                className="btn btn-ghost btn-lg"
                href={LOGIN}
                style={{ color: "#fff", borderColor: "oklch(0.4 0.01 250)" }}
              >
                Talk to the team
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="foot">
        <div className="wrap">
          <div className="grid">
            <div>
              <div className="brand">
                <span className="bm">{PIN}</span> Candi<span className="dot">.</span>
              </div>
              <p className="blurb">
                The nonpartisan, AI-native campaign operating system. Field organizing, ground up.
              </p>
            </div>
            <div className="col">
              <h5>Product</h5>
              <a href="#product">Voters</a>
              <a href="#product">Turf</a>
              <a href="#product">Texting</a>
              <a href="#peek">HQ</a>
            </div>
            <div className="col">
              <h5>Company</h5>
              <a href="#top">About</a>
              <a href="#security">Security</a>
              <a href="#pricing">Pricing</a>
              <a href="#top">Careers</a>
            </div>
            <div className="col">
              <h5>Resources</h5>
              <a href="#top">Docs</a>
              <a href="#top">Onboarding</a>
              <a href="#faq">FAQ</a>
              <a href="#top">Status</a>
            </div>
          </div>
          <div className="base">
            <span className="np">Nonpartisan infrastructure</span>
            <span>© 2026 Candi. All rights reserved.</span>
            <span className="sp">Privacy · Terms · DPA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
