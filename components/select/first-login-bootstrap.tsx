"use client";

/**
 * Rendered only when the signed-in user has zero accessible campaigns.
 * Calls the maybeBootstrapDemoOrg server action, shows a "Setting up your
 * demo workspace…" state while it runs, then either sets the campaign cookie
 * and redirects to "/" (via selectCampaign), or falls through to a polite
 * error with an option to try again.
 *
 * Returning users (already have campaigns) never see this component.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { maybeBootstrapDemoOrg } from "@/app/select/onboarding-actions";
import { selectCampaign } from "@/app/select/actions";

type Phase = "booting" | "done" | "error";

export function FirstLoginBootstrap() {
  const [phase, setPhase] = useState<Phase>("booting");
  const [errMsg, setErrMsg] = useState<string>("");
  const [retrying, setRetrying] = useState(false);
  const ranRef = useRef(false);

  async function boot() {
    setPhase("booting");
    setErrMsg("");
    try {
      const result = await maybeBootstrapDemoOrg();

      if (result.status === "seeded" || result.status === "existing") {
        // Set cookie + redirect via the existing selectCampaign action.
        // selectCampaign calls redirect() internally (throws), so nothing
        // after it executes — that's expected.
        await selectCampaign(result.campaignId);
        // If we somehow reach here, the redirect hasn't fired yet — mark done
        // so the loading state persists (avoids flicker before nav completes).
        setPhase("done");
      } else if (result.status === "no_personal_org") {
        // User has no personal org yet (e.g. they were added to a shared org
        // directly). Let the normal campaign picker show — they may have
        // campaigns from other orgs visible via RLS.
        setPhase("error");
        setErrMsg("We couldn't find a workspace to set up. Contact support if this persists.");
      } else {
        setPhase("error");
        setErrMsg(result.message ?? "Something went wrong setting up your workspace.");
      }
    } catch (e) {
      // selectCampaign throws a Next.js NEXT_REDIRECT (not an error).
      // Re-throw it so Next.js can handle the redirect.
      if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
      setPhase("error");
      setErrMsg("Couldn't set up your demo workspace. Check your connection and try again.");
      console.error("FirstLoginBootstrap:", e);
    }
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void boot();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "booting" || phase === "done") {
    return (
      <div className="select-screen">
        <div className="select-shell">
          <div className="bootstrap-state">
            <div className="bootstrap-ico">
              <Sparkles style={{ width: 28, height: 28 }} />
            </div>
            <h1 className="bootstrap-title serif">Setting up your workspace…</h1>
            <p className="muted bootstrap-sub">
              Building a demo campaign so you can explore every feature right away.
              This takes just a moment.
            </p>
            <Loader2 className="bootstrap-spinner" aria-label="Loading" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="select-screen">
      <div className="select-shell">
        <div className="bootstrap-state">
          <h1 className="bootstrap-title serif">Hmm, something went wrong</h1>
          <p className="muted bootstrap-sub">{errMsg}</p>
          <button
            type="button"
            className="btn accent"
            onClick={() => {
              setRetrying(true);
              ranRef.current = false;
              void boot().finally(() => setRetrying(false));
            }}
            disabled={retrying}
          >
            {retrying ? <Loader2 className="onb-spin" /> : null}
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    </div>
  );
}
