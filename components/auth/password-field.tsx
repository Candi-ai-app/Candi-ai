"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password input with an inline show/hide toggle. Used inside the login form
 * (a server component), so the interactive bit lives here as a client island.
 * The input keeps name="password" so it posts to signIn/signUp unchanged.
 */
export function PasswordField() {
  const [show, setShow] = useState(false);

  return (
    <div className="auth-pw">
      <input
        className="scr-input auth-pw-input"
        name="password"
        type={show ? "text" : "password"}
        placeholder="6+ characters"
        required
        minLength={6}
        autoComplete="current-password"
      />
      <button
        type="button"
        className="auth-pw-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={0}
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
