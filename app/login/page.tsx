import { signIn, signUp } from "./actions";
import { PasswordField } from "@/components/auth/password-field";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="auth-screen">
      <form className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <span className="auth-wordmark">Candi</span>
          <small className="auth-ver">v1·MVP</small>
        </div>

        <div>
          <h1 className="auth-title serif">Sign in to your campaign</h1>
          <p className="auth-sub muted">The nonpartisan campaign operating system.</p>
        </div>

        <label className="auth-field">
          <span>Email</span>
          <input className="scr-input" name="email" type="email" placeholder="you@campaign.org" required autoComplete="email" />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <PasswordField />
        </label>

        {error && (
          <div className="auth-error" role="alert">
            {decodeURIComponent(error)}
          </div>
        )}

        <button className="btn accent auth-submit" formAction={signIn}>Sign in</button>

        <div className="auth-divider"><span>new to Candi?</span></div>
        <button className="btn auth-secondary" formAction={signUp}>Create an account</button>

        <p className="auth-hint muted">
          Demo · any email + a 6-character password creates a director account on the Reyes campaign.
        </p>
      </form>
    </div>
  );
}
