"use client";

/**
 * CANDI first-run tutorial overlay.
 *
 * Shows once, after a user's demo campaign is set up. Persists completion in
 * localStorage under "candi.tutorial.v1" so it never re-fires.
 *
 * The `isFirstRun` prop is derived server-side (passed from the page that
 * just finished seeding). When false the component renders nothing — zero
 * cost for returning users.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Map,
  Footprints,
  Sparkles,
  Users,
  X,
} from "lucide-react";

export const TUTORIAL_KEY = "candi.tutorial.v1";

type Step = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: <BarChart2 style={{ width: 28, height: 28 }} />,
    title: "Your campaign dashboard",
    body: "The HQ view shows live KPIs — voters identified, doors knocked, and canvassers in the field. Everything updates in real time.",
  },
  {
    icon: <Users style={{ width: 28, height: 28 }} />,
    title: "Voter list",
    body: "Browse and filter your voter universe by party, support score, vote history, or race. Bulk-tag persuadables and target your next outreach in seconds.",
  },
  {
    icon: <Map style={{ width: 28, height: 28 }} />,
    title: "Canvassing & turf",
    body: "Draw turfs, assign canvassers, and watch contact markers appear on the live map as your team knocks doors.",
  },
  {
    icon: <Footprints style={{ width: 28, height: 28 }} />,
    title: "Field app",
    body: "Canvassers get a turn-by-turn route, a voter card at every door, and a tap to log results — all from their phone, no app store needed.",
  },
  {
    icon: <Sparkles style={{ width: 28, height: 28 }} />,
    title: "Ask Candi",
    body: "Your AI political director. Ask Candi who to target, how to tighten your message, or what the data is telling you — it knows your voter file.",
  },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTutorial() {
  const [show, setShow] = useState(false);

  // Check localStorage on mount — never show if already done/skipped.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TUTORIAL_KEY)) setShow(true);
    } catch {
      // Safari private mode or SSR — silently skip
    }
  }, []);

  const dismiss = useCallback((finished = false) => {
    try {
      localStorage.setItem(TUTORIAL_KEY, finished ? "done" : "skipped");
    } catch {
      // ignore
    }
    setShow(false);
  }, []);

  return { show, dismiss };
}

// ─── Component ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function Tutorial({}: {}) {
  const { show, dismiss } = useTutorial();
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Trap focus inside the overlay when open.
  useEffect(() => {
    if (!show) return;
    const el = dialogRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show, dismiss]);

  if (!show) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function next() {
    if (isLast) { dismiss(true); return; }
    setStep((s) => s + 1);
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <div
      className="tutorial-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="CANDI orientation tour"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="tutorial-card" ref={dialogRef}>
        {/* Header */}
        <div className="tutorial-head">
          <button
            type="button"
            className="tutorial-skip btn ghost"
            onClick={() => dismiss()}
            aria-label="Skip tour"
          >
            Skip tour
          </button>
          <button
            type="button"
            className="tutorial-close"
            onClick={() => dismiss()}
            aria-label="Close"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Step content */}
        <div className="tutorial-body">
          <div className="tutorial-ico" aria-hidden>
            {current.icon}
          </div>
          <h2 className="tutorial-title">{current.title}</h2>
          <p className="tutorial-text">{current.body}</p>
        </div>

        {/* Dots */}
        <div className="tutorial-dots" role="tablist" aria-label="Tour progress">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}`}
              className={"tutorial-dot" + (i === step ? " active" : "")}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        {/* Nav */}
        <div className="tutorial-nav">
          {step > 0 ? (
            <button type="button" className="btn tutorial-back" onClick={back}>
              <ArrowLeft style={{ width: 14, height: 14 }} />
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn accent tutorial-next"
            onClick={next}
          >
            {isLast ? (
              "Let's go"
            ) : (
              <>
                Next
                <ArrowRight style={{ width: 14, height: 14 }} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Relaunch button (for topbar "?" trigger) ─────────────────────────────────

export function TutorialRelaunchButton() {
  const [visible, setVisible] = useState(false);

  // Only render after client hydration (localStorage access)
  useEffect(() => { setVisible(true); }, []);

  function relaunch() {
    try {
      localStorage.removeItem(TUTORIAL_KEY);
    } catch { /* ignore */ }
    // Reload the page so the Tutorial component re-mounts and checks localStorage.
    window.location.reload();
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      className="btn ghost tutorial-relaunch-btn"
      onClick={relaunch}
      aria-label="Relaunch tour"
      title="Relaunch tour"
    >
      ?
    </button>
  );
}
