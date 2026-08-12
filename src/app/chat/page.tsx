"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Mark, Wordmark } from "@/components/Logo";
import MemoryPanel from "@/components/MemoryPanel";
import { PERSONAS, getPersona } from "@/lib/persona";
import {
  addMemories,
  addMsg,
  buildContext,
  getMemories,
  getMsgs,
  replaceLastAssistant,
  subscribe,
  wipePersona,
  type Memory,
  type Msg,
} from "@/lib/store";

const PERSONA_KEY = "kithra:persona";

export default function ChatPage() {
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  /* Read persisted state only after mount — the server has no localStorage. */
  useEffect(() => {
    setPersonaId(window.localStorage.getItem(PERSONA_KEY));
    setReady(true);
  }, []);

  const refresh = useCallback(() => {
    if (!personaId) return;
    setMsgs(getMsgs(personaId));
    setMemories(getMemories(personaId));
  }, [personaId]);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, busy]);

  const choose = (id: string) => {
    window.localStorage.setItem(PERSONA_KEY, id);
    setPersonaId(id);
    setTimeout(() => composer.current?.focus(), 120);
  };

  async function send() {
    const text = draft.trim();
    if (!text || busy || !personaId) return;

    setDraft("");
    setError(null);
    setBusy(true);
    addMsg(personaId, "user", text);

    const ctx = buildContext(personaId);
    addMsg(personaId, "assistant", "");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId,
          history: ctx.history,
          memories: ctx.memories,
        }),
      });

      if (!res.ok || !res.body) {
        const { error: msg } = await res.json().catch(() => ({ error: null }));
        throw new Error(msg ?? "Something went wrong reaching the model.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        replaceLastAssistant(personaId, acc);
      }

      if (!acc.trim()) {
        replaceLastAssistant(personaId, "…I lost my thread there. Say that again?");
      }

      /* Extraction runs after the reply lands so it never delays the response. */
      void (async () => {
        try {
          const r = await fetch("/api/remember", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exchange: [
                { role: "user", content: text },
                { role: "assistant", content: acc },
              ],
              known: getMemories(personaId).map((m) => m.text),
            }),
          });
          const { memories: found } = await r.json();
          if (found?.length) {
            const added = addMemories(personaId, found, "auto");
            if (added.length) {
              const ids = new Set(added.map((m) => m.id));
              setRecentIds(ids);
              setTimeout(() => setRecentIds(new Set()), 2600);
            }
          }
        } catch {
          /* best effort */
        }
      })();
    } catch (e) {
      replaceLastAssistant(
        personaId,
        "",
      );
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      composer.current?.focus();
    }
  }

  if (!ready) return <div className="flex-1" />;

  /* ── first run: pick a voice ─────────────────────────────────────── */
  if (!personaId) {
    return (
      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link href="/" className="inline-block">
            <Wordmark size={20} />
          </Link>
          <h1 className="mt-10 font-serif text-4xl leading-tight text-ink sm:text-5xl">
            Who are you talking to?
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-2">
            Each one keeps its own memory. You can switch later — they won&rsquo;t
            share notes.
          </p>

          <div className="mt-9 grid gap-3">
            {PERSONAS.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i + 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => choose(p.id)}
                className="group flex items-start gap-4 rounded-xl border border-line bg-paper-2 p-5 text-left transition-colors hover:border-ember/50"
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: p.accent }}
                />
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2.5">
                    <span className="font-serif text-xl text-ink">{p.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {p.role}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[14px] leading-relaxed text-ink-2">
                    {p.blurb}
                  </span>
                </span>
                <span className="ml-auto self-center text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ember">
                  →
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </main>
    );
  }

  const persona = getPersona(personaId);

  return (
    <div className="relative z-10 flex flex-1 overflow-hidden">
      {/* ── conversation ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Home">
            <Mark size={22} />
          </Link>
          <div className="min-w-0">
            <p className="font-serif text-[17px] leading-none text-ink">
              {persona.name}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
              {persona.role}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                if (confirm(`Erase this conversation and everything ${persona.name} remembers?`)) {
                  wipePersona(personaId);
                }
              }}
              className="rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted hover:bg-paper-2 hover:text-ember"
            >
              reset
            </button>
            <button
              onClick={() => {
                window.localStorage.removeItem(PERSONA_KEY);
                setPersonaId(null);
              }}
              className="rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted hover:bg-paper-2 hover:text-ember"
            >
              switch
            </button>
            <button
              onClick={() => setPanelOpen(true)}
              className="relative rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted hover:bg-paper-2 hover:text-ember lg:hidden"
            >
              memory
              {memories.length > 0 && (
                <span className="ml-1 text-ember">{memories.length}</span>
              )}
            </button>
          </div>
        </header>

        <div ref={scroller} className="scrollskin flex-1 overflow-y-auto px-4 sm:px-6">
          <div className="mx-auto w-full max-w-2xl py-8">
            {msgs.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="py-16 text-center"
              >
                <Mark size={40} breathe className="mx-auto" />
                <p className="mt-6 font-serif text-2xl text-ink">
                  {persona.openers[0]}
                </p>
                <p className="mt-2 text-[13px] text-muted">
                  Nothing is remembered until you say something worth keeping.
                </p>
              </motion.div>
            )}

            <div className="space-y-6">
              {msgs.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className={m.role === "user" ? "flex justify-end" : ""}
                >
                  {m.role === "user" ? (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-paper-3 px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                      {m.content}
                    </p>
                  ) : (
                    <div className="flex gap-3">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: persona.accent }}
                      />
                      <p className="whitespace-pre-wrap text-[15px] leading-[1.75] text-ink">
                        {m.content}
                        {busy && !m.content && (
                          <span className="inline-flex gap-1 align-middle">
                            {[0, 1, 2].map((i) => (
                              <motion.span
                                key={i}
                                className="h-1.5 w-1.5 rounded-full bg-muted"
                                animate={{ opacity: [0.25, 1, 0.25] }}
                                transition={{
                                  duration: 1.1,
                                  repeat: Infinity,
                                  delay: i * 0.18,
                                }}
                              />
                            ))}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 rounded-lg border border-ember/40 bg-ember-wash px-4 py-2.5 text-[13px] text-ink-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="border-t border-line px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
            <textarea
              ref={composer}
              rows={1}
              value={draft}
              disabled={busy}
              placeholder={`Say something to ${persona.name}…`}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              className="max-h-44 flex-1 resize-none rounded-xl border border-line bg-paper-2 px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-ember/60 disabled:opacity-60"
            />
            <button
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ember text-paper transition-opacity hover:opacity-90 disabled:opacity-25"
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
              </svg>
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-center font-mono text-[10px] tracking-wide text-muted">
            last {Math.min(msgs.length, 12)} messages + {memories.length} memories sent as context
          </p>
        </div>
      </main>

      {/* ── memory ledger: fixed rail on desktop ── */}
      <aside className="hidden w-[340px] shrink-0 border-l border-line bg-paper-2 lg:block">
        <MemoryPanel personaId={personaId} memories={memories} recentIds={recentIds} />
      </aside>

      {/* ── memory ledger: drawer on small screens ── */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPanelOpen(false)}
              className="fixed inset-0 z-40 bg-ink/25 lg:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed right-0 top-0 z-50 h-full w-[86%] max-w-[350px] border-l border-line bg-paper-2 lg:hidden"
            >
              <MemoryPanel personaId={personaId} memories={memories} recentIds={recentIds} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
