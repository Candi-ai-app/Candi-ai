"use client";

/* Invite-accept island (rendered by app/invite/page.tsx).
 *
 * The Supabase invite email's verify link redirects here with the new session
 * in the URL HASH (#access_token=…&refresh_token=…&type=invite) — invites use
 * the implicit grant; PKCE is unsupported for them (the inviter's browser and
 * the invitee's browser differ). The app-wide browser client (utils/supabase/
 * client.ts) is hard-wired to flowType "pkce" by @supabase/ssr and would
 * REJECT that hash ("Not a valid PKCE flow url"), so this island:
 *   1. creates a local, non-singleton client with detectSessionInUrl OFF,
 *   2. parses the hash itself and calls setSession() — which persists the
 *      session into the same auth cookies the rest of the app reads,
 *   3. lets the invitee set a password (updateUser), then hands off to
 *      /select with a full navigation so the server sees the cookies.
 * The signup trigger already enrolled them in the inviting org at send time.
 */

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Phase =
  | { k: "checking" }
  | { k: "set-password"; email: string }
  | { k: "signed-in"; email: string }
  | { k: "invalid"; message: string };

function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // Non-singleton + manual hash handling (see header comment).
    { isSingleton: false, auth: { detectSessionInUrl: false } }
  );
}

const MIN_PASSWORD = 10; // matches the server-side policy in app/login/actions.ts

export function InviteAccept() {
  const supabaseRef = useRef<ReturnType<typeof makeClient> | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "checking" });
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = (supabaseRef.current ??= makeClient());
    const raw = window.location.hash;
    const params = new URLSearchParams(raw.startsWith("#") ? raw.slice(1) : raw);
    const hashError = params.get("error_description") || params.get("error");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    let cancelled = false;
    (async () => {
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (error || !data.session) {
          setPhase({ k: "invalid", message: error?.message ?? "This invite link is invalid or has expired." });
          return;
        }
        // Strip the tokens from the address bar.
        window.history.replaceState(null, "", window.location.pathname);
        setPhase({ k: "set-password", email: data.session.user.email ?? "" });
        return;
      }
      if (hashError) {
        setPhase({
          k: "invalid",
          message: /expired|invalid/i.test(hashError)
            ? "This invite link has expired or was already used. Ask your campaign admin to send a new one — or sign in if you've already set a password."
            : hashError.replace(/\+/g, " "),
        });
        return;
      }
      // No hash at all — maybe they reloaded after accepting, or wandered here.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setPhase({ k: "signed-in", email: data.session.user.email ?? "" });
      } else {
        setPhase({
          k: "invalid",
          message: "This page only works from an invite email link. Ask your campaign admin to send one.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    if (password.length < MIN_PASSWORD) {
      setErr(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setErr(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    // Full navigation so the server render picks up the auth cookies.
    window.location.assign("/select");
  };

  return (
    <div className="invite-screen">
      <div className="invite-card card">
        <div className="invite-brand">
          <span className="brand-mark">C</span> Candi
        </div>

        {phase.k === "checking" && <p className="invite-note muted">Checking your invite…</p>}

        {phase.k === "invalid" && (
          <>
            <h1 className="invite-h">Invite link problem</h1>
            <p className="invite-note muted">{phase.message}</p>
            <a className="btn primary invite-cta" href="/login">
              Go to sign in
            </a>
          </>
        )}

        {phase.k === "signed-in" && (
          <>
            <h1 className="invite-h">You&apos;re signed in</h1>
            <p className="invite-note muted">
              {phase.email ? `Signed in as ${phase.email}. ` : ""}Your campaign workspace is ready.
            </p>
            <a className="btn primary invite-cta" href="/select">
              Continue to your campaigns
            </a>
          </>
        )}

        {phase.k === "set-password" && (
          <>
            <h1 className="invite-h">Welcome to the team</h1>
            <p className="invite-note muted">
              {phase.email ? (
                <>
                  Joining as <b>{phase.email}</b>.{" "}
                </>
              ) : null}
              Set a password to finish creating your account.
            </p>
            <form onSubmit={submit} className="invite-form">
              <div className="invite-pw">
                <input
                  type={show ? "text" : "password"}
                  className="map-select"
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={MIN_PASSWORD}
                  autoComplete="new-password"
                  autoFocus
                  required
                  aria-label="New password"
                  style={{ width: "100%" }}
                />
                <button
                  type="button"
                  className="invite-eye"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              {err && (
                <div className="team-msg err" role="alert">
                  {err}
                </div>
              )}
              <button type="submit" className="btn primary invite-cta" disabled={busy}>
                {busy ? "Setting up…" : "Set password & enter"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
