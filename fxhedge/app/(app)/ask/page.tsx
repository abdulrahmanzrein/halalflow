"use client";
import { useState, useRef, useEffect } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { useChats, groupByDay, type ChatMessage } from "@/hooks/use-chats";
import { dealContextFromSnapshot } from "@/lib/assistant/deal-context";
import { Markdown } from "@/components/markdown";
import { ArrowUp, Plus, Sparkles, Trash2, PanelLeft } from "lucide-react";

const SUGGESTED = [
  "What is murabaha and can I use it to hedge my invoice?",
  "Is a forward contract permissible in Islamic finance?",
  "What are my halal alternatives to a currency swap?",
  "How does a wa'd-based FX arrangement work?",
];

const UNAVAILABLE =
  "The assistant is unavailable right now. For Islamic-finance questions about your payment, please consult a qualified Sharia advisor.";

export default function AskPage() {
  const d = useAppData();
  const { chats, active, activeId, ready, setActiveId, startChat, appendTo, removeChat } = useChats();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [railOpen, setRailOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");

    const id = activeId ?? startChat(q);
    if (activeId) appendTo(id, { role: "user", text: q });
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          ...dealContextFromSnapshot(d),
        }),
      });
      const data: { answer?: string; error?: boolean } = await res.json();
      const reply: ChatMessage =
        !res.ok || data.error || !data.answer
          ? { role: "assistant", text: UNAVAILABLE, error: true }
          : { role: "assistant", text: data.answer };
      appendTo(id, reply);
    } catch {
      appendTo(id, {
        role: "assistant",
        text: "Could not reach the assistant. Check your connection and try again.",
        error: true,
      });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const groups = groupByDay(chats);
  const empty = !active;

  return (
    <div className="flex gap-4 lg:h-[calc(100dvh-4.75rem)]">
      {/* History rail */}
      {railOpen && (
        <aside className="hidden md:flex w-[248px] shrink-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          <div className="p-3 shrink-0">
            <button
              onClick={() => { setActiveId(null); setInput(""); inputRef.current?.focus(); }}
              className="press flex w-full items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
            >
              <Plus size={16} /> New conversation
            </button>
          </div>

          <div className="slim-scroll flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {!ready ? null : chats.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-[var(--color-muted-fg)]">
                Your past questions will appear here, grouped by day.
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.label} className="mb-3">
                  <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-dim)]">
                    {g.label}
                  </p>
                  <ul className="space-y-0.5">
                    {g.items.map((c) => {
                      const on = c.id === activeId;
                      return (
                        <li key={c.id} className="group relative">
                          <button
                            onClick={() => setActiveId(c.id)}
                            className={`w-full truncate rounded-lg py-2 pl-3 pr-8 text-left text-[13px] transition-colors ${
                              on
                                ? "bg-[var(--color-muted)] font-medium text-[var(--color-fg)]"
                                : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)]"
                            }`}
                          >
                            {c.title}
                          </button>
                          <button
                            onClick={() => removeChat(c.id)}
                            aria-label={`Delete conversation: ${c.title}`}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--color-dim)] opacity-0 transition-[opacity,color] hover:text-[var(--color-negative)] focus:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 items-center gap-3">
          <button
            onClick={() => setRailOpen((o) => !o)}
            aria-label={railOpen ? "Hide history" : "Show history"}
            aria-expanded={railOpen}
            className="press hidden md:flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-fg)] transition-colors hover:text-[var(--color-fg)]"
          >
            <PanelLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-[22px] font-normal text-[var(--color-fg)]">
              {active ? active.title : "Ask HalalFlow"}
            </h1>
            <p className="text-[12px] text-[var(--color-muted-fg)]">
              Questions about Islamic finance and your {d.fromCurrency}/{d.toCurrency} payment.
              General education only, never a fatwa.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          {empty ? (
            /* Centred first-run state */
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: "linear-gradient(150deg,#4ADE80,var(--color-primary))" }}
              >
                <Sparkles size={22} style={{ color: "#04120A" }} />
              </span>
              <h2 className="mt-4 font-serif text-2xl font-normal text-[var(--color-fg)]">
                What would you like to know?
              </h2>
              <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-[var(--color-muted-fg)]">
                Grounded in cited scholarly sources. Surfaces disagreement between schools rather
                than resolving it.
              </p>
              <div className="mt-6 flex max-w-[560px] flex-wrap justify-center gap-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="press rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-3.5 py-2 text-[12.5px] text-[var(--color-muted-fg)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-fg)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="slim-scroll flex-1 min-h-0 space-y-5 overflow-y-auto px-5 py-5">
              {active.messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--color-muted)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--color-fg)]">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "linear-gradient(150deg,#4ADE80,var(--color-primary))" }}
                    >
                      <Sparkles size={14} style={{ color: "#04120A" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      {m.error ? (
                        <p className="text-[14px]" style={{ color: "var(--color-negative)" }}>
                          {m.text}
                        </p>
                      ) : (
                        <>
                          <Markdown>{m.text}</Markdown>
                          <p className="mt-3 text-[10.5px] text-[var(--color-dim)]">
                            General education, not a fatwa. Consult a qualified scholar for a ruling
                            on your situation.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ),
              )}

              {loading && (
                <div className="flex gap-3" aria-live="polite">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "linear-gradient(150deg,#4ADE80,var(--color-primary))" }}
                  >
                    <Sparkles size={14} style={{ color: "#04120A" }} />
                  </span>
                  <div className="flex-1 space-y-2 pt-1.5">
                    <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--color-muted)]" />
                    <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--color-muted)]" />
                    <div className="h-3 w-2/5 animate-pulse rounded bg-[var(--color-muted)]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Composer */}
          <div className="shrink-0 border-t border-[var(--color-border)] p-3">
            <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus-within:border-[var(--color-primary)] transition-colors">
              <label htmlFor="ask-input" className="sr-only">Your question</label>
              <textarea
                id="ask-input"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about murabaha, wa'd, riba…"
                className="slim-scroll max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-dim)]"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                aria-label="Send question"
                className="press mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-opacity disabled:opacity-30"
                style={{ background: "var(--color-primary)" }}
              >
                <ArrowUp size={16} />
              </button>
            </div>
            <p className="mt-2 px-1 text-[10.5px] text-[var(--color-dim)]">
              Press Enter to send. Shift+Enter for a new line. History stays on this device only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
