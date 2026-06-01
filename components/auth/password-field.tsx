"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password input with an inline show/hide toggle. Used inside the login form
 * (a server component), so the interactive bit lives here as a client island.
 * The input keeps name="password" so it posts to signIn/signUp unchanged.
 *
 * The toggle is positioned *inside* the input on the right: the wrapper is
 * relative, the button is absolutely positioned, and the input gets right
 * padding so typed text never slides under the icon.
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
        {show ? (
          <EyeOff width={16} height={16} aria-hidden />
        ) : (
          <Eye width={16} height={16} aria-hidden />
        )}
      </button>
    </div>
  );
}
