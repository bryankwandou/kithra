"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  forgetMemory,
  updateMemory,
  addMemories,
  exportAll,
  type Memory,
  type MemoryKind,
} from "@/lib/store";

const KIND_LABEL: Record<MemoryKind, string> = {
  fact: "fact",
  preference: "prefers",
  event: "event",
  person: "person",
};

function Row({
  m,
  personaId,
  isNew,
}: {
  m: Memory;
  personaId: string;
  isNew: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== m.text) updateMemory(personaId, m.id, { text: next });
    else setDraft(m.text);
    setEditing(false);
  };

  return (
    <motion.li
      layout
      initial={isNew ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="group relative rounded-lg border border-line bg-paper px-3 py-2.5"
    >
      {m.pinned && (
        <span className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full bg-ember" />
      )}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  setDraft(m.text);
                  setEditing(false);
                }
              }}
              rows={2}
              className="w-full resize-none rounded bg-paper-2 px-2 py-1 text-[13px] leading-snug text-ink outline-none"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="block w-full text-left text-[13px] leading-snug text-ink-2 hover:text-ink"
              title="Click to edit"
            >
              {m.text}
            </button>
          )}

          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {KIND_LABEL[m.kind]}
            </span>
            {m.source === "manual" && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                · yours
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => updateMemory(personaId, m.id, { pinned: !m.pinned })}
            aria-label={m.pinned ? "Unpin" : "Always remember this"}
            title={m.pinned ? "Unpin" : "Always remember this"}
            className="rounded p-1 text-muted hover:bg-paper-3 hover:text-ember"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill={m.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => forgetMemory(personaId, m.id)}
            aria-label="Forget this"
            title="Forget this"
            className="rounded p-1 text-muted hover:bg-paper-3 hover:text-ember"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 4h10M6.5 4V2.8h3V4M5 4l.6 9h4.8L11 4" />
            </svg>
          </button>
        </div>
      </div>
    </motion.li>
  );
}

export default function MemoryPanel({
  personaId,
  memories,
  recentIds,
}: {
  personaId: string;
  memories: Memory[];
  recentIds: Set<string>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const pinned = memories.filter((m) => m.pinned);
  const rest = memories.filter((m) => !m.pinned).sort((a, b) => b.at - a.at);

  const submit = () => {
    const t = draft.trim();
    if (t) addMemories(personaId, [{ text: t, kind: "fact" }], "manual");
    setDraft("");
    setAdding(false);
  };

  const download = () => {
    const blob = new Blob([exportAll(personaId)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kithra-${personaId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="font-serif text-[19px] leading-none text-ink">Memory</h2>
          <p className="mt-1.5 text-[11px] text-muted">
            {memories.length === 0
              ? "Nothing learned yet"
              : `${memories.length} kept · ${pinned.length} pinned`}
          </p>
        </div>
        <button
          onClick={download}
          className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ember"
          title="Download everything as JSON"
        >
          export
        </button>
      </div>

      <div className="scrollskin flex-1 overflow-y-auto px-3 py-3">
        {memories.length === 0 && !adding && (
          <p className="px-2 py-8 text-center text-[13px] leading-relaxed text-muted">
            As you talk, anything worth keeping shows up here.
            <br />
            You decide what stays.
          </p>
        )}

        {pinned.length > 0 && (
          <p className="px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
            Always in context
          </p>
        )}
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {pinned.map((m) => (
              <Row key={m.id} m={m} personaId={personaId} isNew={recentIds.has(m.id)} />
            ))}
          </AnimatePresence>
        </ul>

        {pinned.length > 0 && rest.length > 0 && (
          <p className="px-2 pb-2 pt-4 font-mono text-[10px] uppercase tracking-wider text-muted">
            Recent
          </p>
        )}
        <ul className={`space-y-1.5 ${pinned.length > 0 && rest.length > 0 ? "" : "mt-0"}`}>
          <AnimatePresence initial={false}>
            {rest.map((m) => (
              <Row key={m.id} m={m} personaId={personaId} isNew={recentIds.has(m.id)} />
            ))}
          </AnimatePresence>
        </ul>

        {adding ? (
          <div className="mt-2 rounded-lg border border-ember/40 bg-paper px-3 py-2.5">
            <textarea
              autoFocus
              rows={2}
              value={draft}
              placeholder="They prefer…"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              className="w-full resize-none bg-transparent text-[13px] leading-snug text-ink outline-none placeholder:text-muted"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 w-full rounded-lg border border-dashed border-line px-3 py-2 text-left text-[12px] text-muted hover:border-ember/50 hover:text-ember"
          >
            + Tell it something to remember
          </button>
        )}
      </div>

      <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-muted">
        Stored in this browser. Never uploaded.
      </p>
    </div>
  );
}
