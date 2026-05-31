import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 20 }}>
      <form
        style={{
          width: 340, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: 28, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div className="row" style={{ gap: 8 }}>
          <span className="brand-mark">C</span>
          <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>Candi</span>
          <small style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--mute-2)", padding: "2px 5px", border: "1px solid var(--border)", borderRadius: 4 }}>v1·MVP</small>
        </div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 2 }}>Sign in to your campaign</div>

        <input className="scr-input" name="email" type="email" placeholder="you@campaign.org" required autoComplete="email" />
        <input className="scr-input" name="password" type="password" placeholder="Password (6+ chars)" required minLength={6} autoComplete="current-password" />

        {error && <div style={{ fontSize: 12.5, color: "var(--rose)" }}>{decodeURIComponent(error)}</div>}

        <button className="btn accent" formAction={signIn} style={{ height: 36, justifyContent: "center", marginTop: 2 }}>Sign in</button>
        <button className="btn" formAction={signUp} style={{ height: 36, justifyContent: "center" }}>Create account</button>

        <div className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 2, lineHeight: 1.5 }}>
          Demo: any email + 6-char password creates a director account on the Reyes campaign.
        </div>
      </form>
    </div>
  );
}
