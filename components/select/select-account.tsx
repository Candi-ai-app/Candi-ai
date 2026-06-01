"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import { signOut } from "@/app/login/actions";

function initials(email: string): string {
  const handle = (email.split("@")[0] || "").trim();
  if (!handle) return "U";
  const parts = handle.split(/[.\-_+]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return handle.slice(0, 2).toUpperCase();
}

/**
 * Top-right profile control on the campaign selector: avatar + email with a
 * small dropdown that exposes Sign out (the existing signOut server action).
 */
export function SelectAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="select-account" ref={ref}>
      <button
        type="button"
        className="select-account-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="select-account-avatar" aria-hidden>
          {initials(email)}
        </span>
        {email ? <span className="select-account-email">{email}</span> : null}
        <ChevronDown className="select-account-chev" aria-hidden />
      </button>

      {open && (
        <div className="select-account-menu" role="menu">
          <div className="select-account-meta">
            <span className="select-account-meta-label">Signed in as</span>
            <b title={email}>{email || "your account"}</b>
          </div>
          <form action={signOut}>
            <button type="submit" className="select-account-signout" role="menuitem">
              <LogOut aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
