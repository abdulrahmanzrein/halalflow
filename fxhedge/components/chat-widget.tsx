"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { dealContextFromSnapshot } from "@/lib/assistant/deal-context";
import { MessageCircle, X, Send, Sparkles, GripVertical } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const SUGGESTED = [
  "What is murabaha?",
  "Is a forward contract halal?",
  "Halal alternatives to a currency swap?",
  "How does wa'd-based FX work?",
];

const BTN_SIZE       = 56;
const PANEL_WIDTH    = 384;
const PANEL_HEIGHT   = 560;
const PANEL_GAP      = 16;
const EDGE_PAD       = 12;
const DRAG_THRESHOLD = 5;
const POS_KEY        = "hedged:chat-pos";

interface Pos { right: number; bottom: number }
const DEFAULT_POS: Pos = { right: 24, bottom: 24 };

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function ChatWidget() {

  const deal = useAppData();
  const [open, setOpen]         = useState(false);
  const [pos, setPos]           = useState<Pos>(DEFAULT_POS);
  const [ready, setReady]       = useState(false);
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);

  const [viewport, setViewport] = useState({ w: 1024, h: 768 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const dragRef   = useRef<{ startX: number; startY: number; startR: number; startB: number; moved: boolean } | null>(null);

  // Restore saved position + viewport (mount only — window is undefined during SSR)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POS_KEY);
      if (saved) setPos(JSON.parse(saved));
    } catch {}
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    setReady(true);
  }, []);

  // Persist position on change
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch {}
  }, [pos, ready]);

  // Clamp position on window resize so button never ends up off-screen
  useEffect(() => {
    if (!ready) return;
    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      setViewport({ w, h });
      setPos((p) => ({
        right:  clamp(p.right,  EDGE_PAD, Math.max(EDGE_PAD, w - BTN_SIZE - EDGE_PAD)),
        bottom: clamp(p.bottom, EDGE_PAD, Math.max(EDGE_PAD, h - BTN_SIZE - EDGE_PAD)),
      }));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* -------- drag handlers -------- */

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      d.moved = true;
      setDragging(true);
    }
    if (!d.moved) return;
    // dx positive = mouse moved right → decrease right offset
    const w = window.innerWidth, h = window.innerHeight;
    const newRight  = clamp(d.startR - dx, EDGE_PAD, Math.max(EDGE_PAD, w - BTN_SIZE - EDGE_PAD));
    const newBottom = clamp(d.startB - dy, EDGE_PAD, Math.max(EDGE_PAD, h - BTN_SIZE - EDGE_PAD));
    setPos({ right: newRight, bottom: newBottom });
  }, []);

  const onPointerUp = useCallback((_e: PointerEvent) => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup",   onPointerUp);
    const d = dragRef.current;
    if (d && !d.moved) {
      // Treat as a click → toggle chat
      setOpen((o) => !o);
    }
    dragRef.current = null;
    setDragging(false);
  }, [onPointerMove]);

  function onPointerDown(e: React.PointerEvent) {
    // Ignore secondary buttons
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startR: pos.right,
      startB: pos.bottom,
      moved:  false,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup",   onPointerUp);
  }

  /* -------- send message -------- */

  async function send(question: string) {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          ...dealContextFromSnapshot(deal),
        }),
      });
      const data = await res.json();
      if (data.error || !data.answer) {
        setMessages((m) => [...m, {
          role: "assistant",
          text: "The assistant is unavailable right now. For Islamic-finance questions about your payment, please consult a qualified Sharia advisor.",
          error: true,
        }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
      }
    } catch {
      setMessages((m) => [...m, {
        role: "assistant",
        text: "Could not reach the assistant. Check your connection and try again.",
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  /* -------- panel positioning (relative to button) -------- */

  const buttonTopFromTop = viewport.h - pos.bottom - BTN_SIZE;
  const roomAbove = buttonTopFromTop - PANEL_GAP;
  const openAbove = roomAbove >= PANEL_HEIGHT || roomAbove >= viewport.h - buttonTopFromTop - BTN_SIZE;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex:   40,
    right:    Math.min(pos.right, Math.max(EDGE_PAD, viewport.w - PANEL_WIDTH - EDGE_PAD)),
    ...(openAbove
      ? { bottom: pos.bottom + BTN_SIZE + PANEL_GAP }
      : { top:    viewport.h - pos.bottom + PANEL_GAP }
    ),
    width:  Math.min(PANEL_WIDTH,  Math.max(240, viewport.w - EDGE_PAD * 2)),
    height: Math.min(PANEL_HEIGHT, Math.max(320, viewport.h - EDGE_PAD * 2 - BTN_SIZE - PANEL_GAP)),
    background:  "var(--color-card)",
    borderColor: "var(--color-border)",
    boxShadow:   "var(--shadow-chat-panel)",
    opacity:       ready && open ? 1 : 0,
    transform:     open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.98)",
    transformOrigin: openAbove ? "bottom right" : "top right",
    pointerEvents: open ? "auto" : "none",
    transition:    "opacity 220ms cubic-bezier(0.2,0,0,1), transform 220ms cubic-bezier(0.2,0,0,1)",
  };

  /* -------- render -------- */

  return (
    <>
      {/* Trigger button — draggable */}
      <button
        onPointerDown={onPointerDown}
        aria-label={open ? "Close chat" : "Ask HalalFlow"}
        aria-expanded={open}
        aria-controls="hedged-chat-panel"
        className="fixed z-40 flex items-center justify-center rounded-full select-none touch-none"
        style={{
          right:      pos.right,
          bottom:     pos.bottom,
          width:      BTN_SIZE,
          height:     BTN_SIZE,
          background: open ? "var(--color-card)" : "linear-gradient(135deg, #16A34A, #22C55E)",
          border:     open ? "1px solid var(--color-border)" : "none",
          color:      open ? "var(--color-fg)" : "#04120A",
          boxShadow:  open
            ? "var(--shadow-chat-button)"
            : "0 8px 30px rgba(34,197,94,0.45), 0 0 0 2px rgba(34,197,94,0.15)",
          cursor:     dragging ? "grabbing" : "grab",
          transition: dragging
            ? "none"
            : "background-color 200ms cubic-bezier(0.2,0,0,1), box-shadow 200ms cubic-bezier(0.2,0,0,1), transform 200ms cubic-bezier(0.2,0,0,1)",
          transform:  dragging ? "scale(1.06)" : "scale(1)",
        }}
      >
        <div className="relative w-6 h-6 pointer-events-none">
          <MessageCircle
            size={22}
            className="absolute inset-0 m-auto"
            style={{
              opacity:    open ? 0 : 1,
              transform:  open ? "scale(0.5) rotate(-40deg)" : "scale(1) rotate(0)",
              transition: "opacity 200ms cubic-bezier(0.2,0,0,1), transform 200ms cubic-bezier(0.2,0,0,1)",
              filter:     open ? "blur(4px)" : "blur(0)",
            }}
          />
          <X
            size={22}
            className="absolute inset-0 m-auto"
            style={{
              opacity:    open ? 1 : 0,
              transform:  open ? "scale(1) rotate(0)" : "scale(0.5) rotate(40deg)",
              transition: "opacity 200ms cubic-bezier(0.2,0,0,1), transform 200ms cubic-bezier(0.2,0,0,1)",
              filter:     open ? "blur(0)" : "blur(4px)",
            }}
          />
        </div>
      </button>

      {/* Chat panel */}
      <div
        id="hedged-chat-panel"
        role="dialog"
        aria-modal="false"
        aria-label="Ask HalalFlow"
        className="flex flex-col rounded-2xl border overflow-hidden"
        style={panelStyle}
      >
        {/* Header — also serves as a drag hint (visual only, drag happens on button) */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <div
            className="grid place-items-center h-9 w-9 rounded-xl shrink-0"
            style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)", color: "#04120A" }}
          >
            <Sparkles size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-[var(--color-fg)]">Ask HalalFlow</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Islamic finance, general education only</p>
          </div>
          <div
            className="text-[var(--color-muted-fg)] opacity-40"
            title="Drag the green button to move"
            aria-hidden
          >
            <GripVertical size={14} />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-fg)] mb-1">
                Try asking
              </p>
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="block w-full text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-[13px] text-[var(--color-fg)] hover:border-[var(--color-primary)] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                style={
                  m.role === "user"
                    ? { background: "var(--color-primary)", color: "#fff" }
                    : m.error
                    ? { background: "var(--color-muted)", color: "var(--color-muted-fg)", fontStyle: "italic" }
                    : { background: "var(--color-muted)", color: "var(--color-fg)" }
                }
              >
                {m.text.split("\n").map((line, j, arr) => (
                  <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                ))}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3.5 py-3" style={{ background: "var(--color-muted)" }}>
                <div className="flex gap-1 items-center h-2">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full animate-bounce"
                      style={{ background: "var(--color-muted-fg)", animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[var(--color-border)] p-3 shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex gap-2 items-center"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={loading}
              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-muted-fg)] outline-none focus:border-[var(--color-primary)] transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition-opacity disabled:opacity-40"
              style={{ background: "var(--color-primary)" }}
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] text-[var(--color-muted-fg)]">
            Not a fatwa. Not financial advice.
          </p>
        </div>
      </div>
    </>
  );
}
