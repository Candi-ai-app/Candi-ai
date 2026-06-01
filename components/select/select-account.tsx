import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

/**
 * Account control in the upper-right of the campaign selector. Intentionally
 * minimal: the signed-in email and an inline Sign out, rendered as
 * `you@x.app · Sign out` — no avatar, no "Signed in as", no dropdown toggle.
 * Sign out posts to the existing signOut server action.
 */
export function SelectAccount({ email }: { email: string }) {
  return (
    <div className="select-account">
      {email ? (
        <>
          <span className="select-account-email" title={email}>
            {email}
          </span>
          <span className="select-account-sep" aria-hidden>
            ·
          </span>
        </>
      ) : null}
      <form action={signOut}>
        <button type="submit" className="select-account-signout">
          <LogOut aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}
