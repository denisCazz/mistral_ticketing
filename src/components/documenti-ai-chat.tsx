"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowUp,
  BookOpenText,
  ExternalLink,
  FileSearch,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

interface Fonte {
  index: number;
  documentoId: string;
  titolo: string;
  excerpt: string;
  similarity: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  fonti?: Fonte[];
}

const SUGGESTIONS = [
  "Quali documenti parlano di manutenzione?",
  "Riassumi le scadenze indicate nei documenti",
  "Cosa prevedono i documenti per l’antincendio?",
];

export function DocumentiAiChat() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setError(null);
    setQuestion("");
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: q },
    ]);
    setLoading(true);

    try {
      const res = await fetch("/api/documenti/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Errore nella risposta AI");
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: String(data.answer ?? ""),
          fonti: Array.isArray(data.fonti) ? data.fonti : [],
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Non sono riuscito a rispondere: ${msg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="relative overflow-hidden bg-slate-950 px-5 py-5 text-white sm:px-6">
        <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/15">
              <Sparkles className="h-5 w-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Assistente documentale
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-5 text-slate-300">
                Cerca informazioni nei documenti aziendali e mostra sempre da
                dove proviene la risposta.
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/20 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" />
            Solo fonti interne
          </div>
        </div>
      </div>

      <div className="flex h-[min(65vh,600px)] min-h-[360px] flex-col bg-slate-50/70">
        <div
          className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6"
          aria-live="polite"
        >
          {messages.length === 0 && !loading && (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-2xl bg-sky-100 p-3 text-sky-700 ring-8 ring-sky-50">
                <FileSearch className="h-6 w-6" />
              </div>
              <p className="font-medium text-slate-800">
                Cosa vuoi sapere dai tuoi documenti?
              </p>
              <p className="mt-1 max-w-md text-sm leading-5 text-slate-500">
                La risposta viene generata esclusivamente dai file caricati e
                include collegamenti alle fonti originali.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setQuestion(suggestion)}
                    className="rounded-full bg-white px-3.5 py-2 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:text-sky-700 hover:ring-sky-300"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sky-300 sm:flex">
                  <Sparkles className="h-4 w-4" />
                </div>
              )}
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[80%] ${
                  m.role === "user"
                    ? "rounded-br-md bg-sky-700 text-white"
                    : "rounded-bl-md bg-white text-slate-700 ring-1 ring-slate-200"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" && m.fonti && m.fonti.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <BookOpenText className="h-3.5 w-3.5" />
                      Fonti consultate
                    </div>
                    <div className="space-y-2">
                      {m.fonti.map((f) => (
                        <Link
                          key={`${m.id}-${f.index}`}
                          href={`/documenti/${f.documentoId}`}
                          className="group block rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 transition hover:bg-sky-50 hover:ring-sky-200"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-xs font-semibold text-slate-700 group-hover:text-sky-800">
                              [{f.index}] {f.titolo}
                            </p>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-sky-600" />
                          </div>
                          {f.excerpt && (
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                              {f.excerpt}
                              {f.excerpt.length >= 280 ? "…" : ""}
                            </p>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sky-300">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <span>Cerco nei documenti indicizzati…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={ask}
          className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6"
        >
          <div className="flex items-end gap-2 rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200 transition-colors focus-within:bg-white focus-within:ring-sky-400">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Chiedi qualcosa sui documenti…"
              rows={1}
              disabled={loading}
              aria-label="Domanda sui documenti"
              className="min-h-10 max-h-28 resize-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
            />
            <Button
              type="submit"
              disabled={loading || !question.trim()}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg bg-sky-700 hover:bg-sky-800"
              aria-label="Invia domanda"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p
            className={`mt-2 text-center text-[11px] ${
              error ? "text-red-600" : "text-slate-400"
            }`}
          >
            {error
              ? error
              : "Le risposte possono contenere errori: verifica sempre le fonti citate."}
          </p>
        </form>
      </div>
    </section>
  );
}

const FAB_STORAGE_KEY = "documenti-ai-chat-position";

interface FabPosition {
  right: number;
  bottom: number;
}

function clampFabPosition(pos: FabPosition, width: number, height: number): FabPosition {
  const maxRight = Math.max(8, window.innerWidth - width - 8);
  const maxBottom = Math.max(8, window.innerHeight - height - 8);
  return {
    right: Math.min(Math.max(8, pos.right), maxRight),
    bottom: Math.min(Math.max(8, pos.bottom), maxBottom),
  };
}

function readStoredFabPosition(): FabPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    if (typeof parsed.right !== "number" || typeof parsed.bottom !== "number") {
      return null;
    }
    return { right: parsed.right, bottom: parsed.bottom };
  } catch {
    return null;
  }
}

export function FloatingDocumentiAiChat() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FabPosition>({ right: 20, bottom: 20 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    width: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const stored = readStoredFabPosition();
    if (stored && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos(clampFabPosition(stored, rect.width, rect.height));
    }
  }, []);

  useEffect(() => {
    function onResize() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setPos((prev) => clampFabPosition(prev, rect.width, rect.height));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(pos));
    } catch {
      // storage non disponibile: ignora
    }
  }, [pos]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    setPos(
      clampFabPosition(
        { right: drag.startRight - dx, bottom: drag.startBottom - dy },
        drag.width,
        drag.height,
      ),
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag?.moved) {
      suppressClickRef.current = true;
    }
  }

  function onPointerCancel() {
    dragRef.current = null;
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        ref={buttonRef}
        type="button"
        style={{ right: pos.right, bottom: pos.bottom }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={handleClick}
        className={`fixed z-40 flex cursor-grab touch-none select-none items-center gap-2.5 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/20 ring-1 ring-white/10 transition hover:bg-sky-800 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 active:cursor-grabbing ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-label="Apri assistente documentale (trascinabile)"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/15 text-sky-300">
          <MessageSquareText className="h-5 w-5" />
          <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
        </span>
        <span className="hidden pr-1 sm:block">Chiedi ai documenti</span>
      </button>

      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-4xl [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:z-10 [&_[data-slot=dialog-close]]:bg-white/10 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:hover:bg-white/20"
        aria-describedby="documenti-ai-description"
      >
        <DialogTitle className="sr-only">Assistente documentale</DialogTitle>
        <DialogDescription id="documenti-ai-description" className="sr-only">
          Fai domande sui documenti aziendali caricati e consulta le fonti
          utilizzate.
        </DialogDescription>
        <DocumentiAiChat />
      </DialogContent>
    </Dialog>
  );
}
