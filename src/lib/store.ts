"use client";

/**
 * Local-first store.
 *
 * Everything a person says and everything Kithra remembers lives in this
 * browser, not on a server. The only thing that leaves the device is the
 * context window we assemble for a single model call, and we never persist
 * that anywhere. This is the whole privacy claim, so it is worth keeping the
 * storage layer boring and easy to audit.
 */

export type Role = "user" | "assistant";

export type Msg = {
  id: string;
  role: Role;
  content: string;
  at: number;
};

export type MemoryKind = "fact" | "preference" | "event" | "person";

export type Memory = {
  id: string;
  text: string;
  kind: MemoryKind;
  pinned: boolean;
  at: number;
  source: "auto" | "manual";
};

const KEY = (personaId: string, part: "msgs" | "mem") =>
  `kithra:${personaId}:${part}`;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Must return void, not the boolean Set.delete gives back — React treats a
  // non-void return from an effect cleanup as an error.
  return () => {
    listeners.delete(fn);
  };
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    emit();
  } catch {
    /* quota or private mode — the session still works, it just won't persist */
  }
}

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ── messages ─────────────────────────────────────────────────────── */

export const getMsgs = (p: string): Msg[] => read<Msg[]>(KEY(p, "msgs"), []);

export function addMsg(p: string, role: Role, content: string): Msg {
  const msg: Msg = { id: uid(), role, content, at: Date.now() };
  write(KEY(p, "msgs"), [...getMsgs(p), msg]);
  return msg;
}

export function replaceLastAssistant(p: string, content: string) {
  const msgs = getMsgs(p);
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") {
      msgs[i] = { ...msgs[i], content };
      break;
    }
  }
  write(KEY(p, "msgs"), msgs);
}

export const clearMsgs = (p: string) => write(KEY(p, "msgs"), []);

/* ── memory ledger ────────────────────────────────────────────────── */

export const getMemories = (p: string): Memory[] =>
  read<Memory[]>(KEY(p, "mem"), []);

/** Naive containment dedup — cheap, and good enough to stop the ledger
 *  filling with three phrasings of the same fact. */
function isDuplicate(existing: Memory[], text: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const t = norm(text);
  if (!t) return true;
  return existing.some((m) => {
    const e = norm(m.text);
    return e === t || e.includes(t) || t.includes(e);
  });
}

export function addMemories(
  p: string,
  items: { text: string; kind: MemoryKind }[],
  source: "auto" | "manual" = "auto",
): Memory[] {
  const existing = getMemories(p);
  const fresh: Memory[] = [];
  for (const it of items) {
    if (isDuplicate([...existing, ...fresh], it.text)) continue;
    fresh.push({
      id: uid(),
      text: it.text.trim(),
      kind: it.kind,
      pinned: false,
      at: Date.now(),
      source,
    });
  }
  if (fresh.length) write(KEY(p, "mem"), [...existing, ...fresh]);
  return fresh;
}

export function updateMemory(p: string, id: string, patch: Partial<Memory>) {
  write(
    KEY(p, "mem"),
    getMemories(p).map((m) => (m.id === id ? { ...m, ...patch } : m)),
  );
}

export const forgetMemory = (p: string, id: string) =>
  write(
    KEY(p, "mem"),
    getMemories(p).filter((m) => m.id !== id),
  );

export const clearMemories = (p: string) => write(KEY(p, "mem"), []);

export function wipePersona(p: string) {
  clearMsgs(p);
  clearMemories(p);
}

/* ── context assembly ─────────────────────────────────────────────────
   The cost-control lever. Pinned memories always ride along; unpinned ones
   are capped at the most recent MEM_CAP; history is capped at TURN_CAP
   messages. A conversation can run for months without the request growing. */

export const TURN_CAP = 12;
export const MEM_CAP = 18;

export function buildContext(p: string) {
  const mem = getMemories(p);
  const pinned = mem.filter((m) => m.pinned);
  const loose = mem
    .filter((m) => !m.pinned)
    .sort((a, b) => b.at - a.at)
    .slice(0, MEM_CAP);

  return {
    memories: [...pinned, ...loose].map((m) => ({
      text: m.text,
      kind: m.kind,
      pinned: m.pinned,
    })),
    history: getMsgs(p)
      .slice(-TURN_CAP)
      .map((m) => ({ role: m.role, content: m.content })),
  };
}

export function exportAll(p: string) {
  return JSON.stringify(
    { persona: p, exportedAt: new Date().toISOString(), memories: getMemories(p), messages: getMsgs(p) },
    null,
    2,
  );
}
