"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, ArrowUp } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which precincts have the most persuadable voters?",
  "Draft a GOTV text for VBM no-returns",
  "How should I prioritize turf this weekend?",
];

export function AskCandiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const why = res.status === 503 ? await res.text() : "Sorry — I couldn't reach Candi. Try again.";
        setMessages((m) => withLast(m, why));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((m) => withLast(m, acc));
      }
    } catch {
      setMessages((m) => withLast(m, "Sorry — I couldn't reach Candi. Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="ask-candi" role="dialog" aria-label="Ask Candi">
      <div className="ac-head">
        <span className="ac-mark"><Sparkles style={{ width: 13, height: 13 }} /></span>
        <b>Ask Candi</b>
        <span className="muted" style={{ fontSize: 11 }}>· nonpartisan AI</span>
        <button className="ac-x" onClick={onClose} type="button" aria-label="Close"><X style={{ width: 16, height: 16 }} /></button>
      </div>

      <div className="ac-body" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ac-empty">
            <p>Ask about your voters, turf, scripts, or strategy.</p>
            <div className="ac-suggest-list">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ac-suggest" type="button" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={"ac-msg " + m.role}>
              {m.content || (busy && i === messages.length - 1 ? <span className="ac-typing">…</span> : "")}
            </div>
          ))
        )}
      </div>

      <form className="ac-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask Candi…"
          rows={1}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"><ArrowUp style={{ width: 15, height: 15 }} /></button>
      </form>
    </div>
  );
}

function withLast(list: Msg[], content: string): Msg[] {
  const copy = list.slice();
  copy[copy.length - 1] = { role: "assistant", content };
  return copy;
}
