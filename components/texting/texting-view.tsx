"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SlidersHorizontal, Sparkles, Send, Phone, Mail, MoreHorizontal, X, ChevronRight,
} from "lucide-react";
import { THREADS, AI_REPLIES, partyTag } from "@/lib/mock-data";

const DEFAULT_REPLIES = ["Thank them, log support score", "Ask follow-up about top issue", "Send Mira's policy 1-pager"];

export function TextingView() {
  const [sel, setSel] = useState("th3"); // Brandon — persuadable / housing
  const [filter, setFilter] = useState("inbox");
  const messagesRef = useRef<HTMLDivElement>(null);

  const thread = useMemo(() => THREADS.find((t) => t.id === sel) ?? null, [sel]);
  const replies = AI_REPLIES[sel] ?? DEFAULT_REPLIES;
  const unreadTotal = THREADS.reduce((a, t) => a + t.unread, 0);

  const filteredThreads = THREADS.filter((t) => {
    if (filter === "unread") return t.unread > 0;
    if (filter === "persuadable") return t.flags.includes("persuadable");
    if (filter === "volunteer") return t.flags.includes("volunteer");
    return true;
  });

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sel]);

  const initials = (name: string) => name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  const avatarStyle = (party: string, size = 26, font = 11) => ({
    width: size, height: size, fontSize: font,
    background: party === "D" ? "var(--indigo-2)" : party === "R" ? "var(--rose-2)" : "var(--surface-3)",
    color: party === "D" ? "var(--indigo)" : party === "R" ? "var(--rose)" : "var(--muted)",
  });

  return (
    <div className="txt">
      <div className="module-head">
        <div>
          <h1>Texting</h1>
          <div className="sub">
            <span className="mono">{unreadTotal}</span> unread ·&nbsp;
            <span className="mono">2,847</span> sent today ·&nbsp;
            <span className="mono">31%</span> reply rate
          </div>
        </div>
        <div className="acts">
          <button className="btn" type="button"><SlidersHorizontal style={{ width: 13, height: 13 }} /> Segments</button>
          <button className="btn" type="button"><Sparkles style={{ width: 13, height: 13 }} /> AI compose</button>
          <button className="btn primary" type="button"><Send style={{ width: 13, height: 13 }} /> New broadcast</button>
        </div>
      </div>

      <div className="txt-body">
        {/* ── Inbox ─────────────────────────────────────────────────── */}
        <aside className="txt-inbox">
          <div className="txt-filters">
            {[
              { id: "inbox", label: "Inbox", n: THREADS.length },
              { id: "unread", label: "Unread", n: THREADS.filter((t) => t.unread).length },
              { id: "persuadable", label: "Persuadable", n: THREADS.filter((t) => t.flags.includes("persuadable")).length },
              { id: "volunteer", label: "Volunteers", n: THREADS.filter((t) => t.flags.includes("volunteer")).length },
            ].map((f) => (
              <button key={f.id} className={"txt-filter " + (filter === f.id ? "active" : "")} type="button" onClick={() => setFilter(f.id)}>
                {f.label} <span className="mono">{f.n}</span>
              </button>
            ))}
          </div>

          <div className="txt-list">
            {filteredThreads.map((t) => (
              <button key={t.id} className={"txt-thread " + (t.id === sel ? "active" : "")} type="button" onClick={() => setSel(t.id)}>
                <div className="avatar" style={avatarStyle(t.party)}>{initials(t.voter)}</div>
                <div className="txt-thread-body">
                  <div className="row" style={{ gap: 6 }}>
                    <b style={{ fontSize: 12.5, fontWeight: 600 }}>{t.voter}</b>
                    <span style={{ flex: 1 }} />
                    <span className="muted" style={{ fontSize: 11 }}>{t.lastT}</span>
                  </div>
                  <div className="row" style={{ gap: 4, marginTop: 1 }}>
                    {t.party !== "—" && <span className={`tag ${partyTag(t.party)}`}>{t.party}</span>}
                    {t.flags.includes("persuadable") && <span className="tag accent">persuade</span>}
                    {t.flags.includes("volunteer") && <span className="tag indigo">vol</span>}
                    {t.flags.includes("new") && <span className="tag">new</span>}
                  </div>
                  <div className="txt-snippet">{t.snippet}</div>
                </div>
                {t.unread > 0 && <span className="txt-unread mono">{t.unread}</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Thread view ───────────────────────────────────────────── */}
        {thread && (
          <div className="txt-thread-view">
            <div className="txt-thread-head">
              <div className="avatar" style={avatarStyle(thread.party, 34, 12)}>{initials(thread.voter)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{thread.voter}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {thread.party !== "—" && <>{thread.party} · </>}
                  {thread.phone} · Precinct {thread.precinct}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <button className="btn ghost" type="button"><Phone style={{ width: 13, height: 13 }} /></button>
              <button className="btn ghost" type="button"><Mail style={{ width: 13, height: 13 }} /></button>
              <button className="btn ghost" type="button"><MoreHorizontal style={{ width: 13, height: 13 }} /></button>
            </div>

            <div className="txt-messages" ref={messagesRef}>
              <div className="txt-day-divider"><span>Today</span></div>
              {thread.messages.map((m, i) => (
                <div key={i} className={"txt-msg " + m.who}>
                  <div className="txt-bubble">{m.text}</div>
                  <div className="txt-meta">
                    <span className="mono">{m.t}</span>
                    {m.who === "us" && <span> · Sam Park · delivered</span>}
                  </div>
                </div>
              ))}
              {thread.id === "th3" && (
                <div className="txt-typing">
                  <div className="dots"><i /><i /><i /></div>
                  <span className="muted" style={{ fontSize: 11.5 }}>Brandon is typing…</span>
                </div>
              )}
            </div>

            <div className="txt-composer">
              <div className="ai-replies">
                <div className="ai-replies-head">
                  <div className="ai-mark">AI</div>
                  <span>Suggested replies</span>
                  <span className="muted mono" style={{ fontSize: 11 }}>· {thread.flags.includes("persuadable") ? "based on context" : "general"}, persuasion {thread.persuasion}/5</span>
                  <span style={{ flex: 1 }} />
                  <button className="ai-suggest ghost" type="button"><Sparkles style={{ width: 11, height: 11 }} /> Regenerate</button>
                </div>
                <div className="ai-replies-list">
                  {replies.map((r, i) => (
                    <button key={i} className="ai-reply-card" type="button">
                      <div className="ai-reply-tag mono">{i + 1}</div>
                      <div className="ai-reply-text">{r}</div>
                      <ChevronRight style={{ width: 12, height: 12, color: "var(--muted)", flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="txt-input">
                <textarea placeholder="Write a reply… (⌘1, ⌘2, ⌘3 to send AI replies)" />
                <div className="txt-input-foot">
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost" type="button"><Sparkles style={{ width: 13, height: 13 }} /></button>
                    <button className="btn ghost" type="button">+ template</button>
                    <button className="btn ghost" type="button">+ link</button>
                  </div>
                  <span style={{ flex: 1 }} />
                  <span className="muted mono" style={{ fontSize: 11 }}>0 / 160</span>
                  <button className="btn primary" type="button"><Send style={{ width: 13, height: 13 }} /> Send</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Voter context ─────────────────────────────────────────── */}
        {thread && (
          <aside className="txt-ctx">
            <div className="txt-ctx-head">
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Voter context</h3>
              <X style={{ width: 14, height: 14, color: "var(--muted)" }} />
            </div>

            <div className="txt-ctx-body">
              <div className="ai-strip" style={{ marginBottom: 12 }}>
                <div className="ai-mark">AI</div>
                <span>
                  <b>{thread.voter.split(" ")[0]}</b> · {thread.party !== "—" ? `${thread.party} voter` : "volunteer"} in Precinct {thread.precinct}.{" "}
                  {thread.persuasion >= 4 ? "Likely motivated by housing affordability." : "Established supporter."}{" "}
                  <span className="muted">Persuasion {thread.persuasion}/5.</span>
                </span>
              </div>

              <div className="field-row"><div className="lbl">Support</div><div className="val"><ScoreBar v={thread.support} /></div></div>
              <div className="field-row"><div className="lbl">Persuasion</div><div className="val"><ScoreBar v={thread.persuasion} kind="persuade" /></div></div>
              <div className="field-row"><div className="lbl">Tags</div><div className="val row" style={{ gap: 4, flexWrap: "wrap" }}>
                {thread.flags.length === 0 && <span className="muted" style={{ fontSize: 12 }}>—</span>}
                {thread.flags.map((f) => <span key={f} className={`tag ${f === "persuadable" ? "accent" : f === "donor" ? "amber" : f === "VBM" ? "teal" : "indigo"}`}>{f}</span>)}
              </div></div>

              <div style={{ marginTop: 14 }}>
                <div className="lbl-sm">Relevant policies</div>
                <div className="policy-card">
                  <div className="row" style={{ gap: 6 }}>
                    <span className="tag accent">match · 94%</span>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>Renter Relief Act</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Caps annual rent hikes at 5% for buildings 15+ yrs old; expands LIHTC.</div>
                  <div className="row" style={{ gap: 4, marginTop: 8 }}>
                    <button className="ai-suggest ghost" type="button">Preview link</button>
                    <button className="ai-suggest ghost" type="button">Insert quote</button>
                  </div>
                </div>
                <div className="policy-card">
                  <div className="row" style={{ gap: 6 }}>
                    <span className="tag indigo">match · 76%</span>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>Public transit funding</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>$400M state-rail allocation; Port Authority named in PA budget.</div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="lbl-sm">Recent activity</div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <span className="mono">3d ago</span> · Door · Not home<br />
                  <span className="mono">7d ago</span> · Text · Reply received<br />
                  <span className="mono">22d ago</span> · Mail · Intro mailer
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function ScoreBar({ v, kind }: { v: number; kind?: string }) {
  return (
    <div className={`score-bar ${kind || ""}`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? "on" : ""} />)}
    </div>
  );
}
