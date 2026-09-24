"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

type Turn = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Find 20 dental clinics in Austin, Texas",
  "Find Shopify store owners in the USA selling pet products",
  "Find companies that need SEO services in Chicago",
  "Write outreach emails for these leads",
  "Who is due a follow-up?",
  "How is my pipeline doing?",
];

/** Renders WhatsApp-style *bold* / _italic_ safely (no HTML injection). */
function Formatted({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : /^_[^_]+_$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export function AgentConsole({ initial }: { initial: Turn[] }) {
  const [turns, setTurns] = useState<Turn[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [turns, busy]);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function send(message: string) {
    const clean = message.trim();
    if (!clean || busy) return;
    setTurns((t) => [...t, { role: "user", text: clean }]);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: clean }) });
      const data = await res.json().catch(() => ({}));
      setTurns((t) => [...t, { role: "assistant", text: data.reply ?? data.error ?? "Something went wrong." }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "Network error. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex h-[calc(100dvh-15rem)] min-h-[440px] flex-col overflow-hidden md:h-[calc(100dvh-13rem)]">
      <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5" aria-live="polite">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center bg-accent text-white">
              <Icon name="agent" className="h-7 w-7" />
            </div>
            <p className="lp-display text-[32px]">Theron</p>
            <p className="mt-1 text-[15px] text-ink-2">Tell it who you want to reach.</p>
            <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className=" bg-fill px-3.5 py-1.5 text-[13px] text-ink transition hover:bg-accent-soft hover:text-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => {
          const mine = t.role === "user";
          const nextSame = turns[i + 1]?.role === t.role;
          return (
            <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"} ${nextSame ? "" : "pb-2"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-[1.5] ${mine ? "bg-accent font-mono text-[13px] uppercase tracking-[0.02em] text-white" : "border border-line bg-surface-2 text-ink"}`}
              >
                {mine ? t.text : <Formatted text={t.text} />}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 pb-2">
            <div className="flex gap-1 border border-line bg-surface-2 px-4 py-3.5" aria-label="Agent is working">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-2 w-2 animate-pulse bg-accent" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </div>
            {elapsed > 5 && <span className="text-[12px] text-ink-2">{elapsed}s. Research can take a minute or two.</span>}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-line bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a command"
          className="h-11 w-full border border-line bg-surface px-4 text-[15px] outline-none placeholder:text-ink-3 focus:border-accent"
          maxLength={4000}
          aria-label="Command"
          disabled={busy}
        />
        <button
          className="grid h-11 w-11 shrink-0 place-items-center bg-dark text-dark-ink transition hover:bg-accent hover:text-white disabled:bg-fill disabled:text-ink-3"
          disabled={busy || !text.trim()}
          aria-label="Send"
        >
          <Icon name="send" className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
