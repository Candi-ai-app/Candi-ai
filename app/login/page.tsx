import Link from "next/link";
import { signIn, signUp } from "./actions";
import { PIN } from "./icons";
import { PasswordField, GoogleButton, ResetLink, HeroPanel } from "./client";
import "leaflet/dist/leaflet.css";
import "./signin.css";

/* Candi sign-in (/login) — split-screen redesign at high fidelity, ported from
   the source split-screen sign-in design. This is a Server Component: the email
   sign-in / sign-up still POST to the real Supabase server actions (signIn /
   signUp) via <button formAction>, and Supabase errors are surfaced through the
   ?error= search param exactly as before — both redirect to /select on success.
   Interactive pieces (eye toggle, Google/reset notes, Leaflet hero) are client
   islands; all styles are scoped under `.signin`. */

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="signin">
      {/* ── left: form card ── */}
      <section className="formside">
        <div className="formcard">
          <Link className="brand si-el si-d1" href="/welcome">
            <span className="bm">{PIN}</span> Candi<span className="dot">.</span>
          </Link>
          <h1 className="title si-el si-d2">Welcome back.</h1>
          <p className="desc si-el si-d3">
            Sign in to your campaign workspace — voters, turf, and HQ are right where you left them.
          </p>

          <form>
            <div className="field si-el si-d4">
              <label htmlFor="email">Email address</label>
              <div className="inp">
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@campaign.org"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="field si-el si-d5">
              <label htmlFor="password">Password</label>
              <PasswordField />
            </div>

            <div className="row si-el si-d6">
              <label className="check">
                <input type="checkbox" name="rememberMe" defaultChecked /> Keep me signed in
              </label>
              <ResetLink />
            </div>

            {error && (
              <div className="err" role="alert">
                {decodeURIComponent(error)}
              </div>
            )}

            <button className="btn btn-primary si-el si-d7" formAction={signIn}>
              Sign in
            </button>

            <div className="divider si-el si-d8">
              <span>Or continue with</span>
              <div className="ln" />
            </div>

            <GoogleButton />

            <p className="foot-txt si-el si-d9">
              New to Candi?{" "}
              <button className="link" formAction={signUp}>
                Create an account
              </button>
            </p>
          </form>
        </div>
      </section>

      {/* ── right: dark hero panel (Leaflet map + turf zones + testimonials) ── */}
      <HeroPanel />
    </div>
  );
}
