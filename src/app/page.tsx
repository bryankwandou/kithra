"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Mark, Wordmark } from "@/components/Logo";

const ease = [0.22, 1, 0.36, 1] as const;

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={seen ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.62, delay, ease }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* A ledger that fills itself in, so the core idea is visible before signup. */
const DEMO = [
  { text: "They are rebuilding their portfolio site in Next.js", kind: "fact", pin: false },
  { text: "They want criticism first, encouragement second", kind: "prefers", pin: true },
  { text: "Their sister Mira is starting medical school in March", kind: "person", pin: false },
  { text: "They write best between 5am and 8am", kind: "prefers", pin: false },
];

function LedgerDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-100px" });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!seen) return;
    const t = setInterval(() => setN((v) => (v >= DEMO.length ? v : v + 1)), 780);
    return () => clearInterval(t);
  }, [seen]);

  return (
    <div ref={ref} className="rounded-xl border border-line bg-paper-2 p-4 sm:p-5">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <span className="font-serif text-lg text-ink">Memory</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {n} kept · {DEMO.slice(0, n).filter((d) => d.pin).length} pinned
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {DEMO.slice(0, n).map((d, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="relative rounded-lg border border-line bg-paper px-3 py-2.5"
          >
            {d.pin && (
              <span className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full bg-ember" />
            )}
            <p className="text-[13px] leading-snug text-ink-2">{d.text}</p>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">
              {d.kind}
            </p>
          </motion.li>
        ))}
      </ul>
      {n >= DEMO.length && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-center text-[11px] text-muted"
        >
          Every row is editable. Every row is deletable.
        </motion.p>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative z-10 flex flex-1 flex-col">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark size={21} />
        <Link
          href="/chat"
          className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ember hover:text-ember"
        >
          Open Kithra
        </Link>
      </nav>

      {/* ── hero ── */}
      <header className="mx-auto w-full max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted"
            >
              Companion chat · open memory
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.08, ease }}
              className="mt-5 font-serif text-[2.9rem] leading-[1.06] tracking-tight text-ink sm:text-6xl"
            >
              It remembers you.
              <br />
              And it shows you
              <br />
              <span className="text-ember">exactly what it kept.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease }}
              className="mt-7 max-w-lg text-[17px] leading-relaxed text-ink-2"
            >
              Most companion apps keep a private file on you that you never get to
              read. Kithra turns that file into a page you can open, correct, and
              empty whenever you like — and it stays on your machine.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/chat"
                className="rounded-lg bg-ember px-6 py-3 text-[15px] font-medium text-paper transition-opacity hover:opacity-90"
              >
                Start talking
              </Link>
              <span className="text-[13px] text-muted">
                No account. Nothing to install.
              </span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.25, ease }}
            className="relative"
          >
            <div className="absolute -inset-6 -z-10 rounded-full bg-ember/[0.06] blur-3xl" />
            <div className="flex justify-center py-6">
              <Mark size={132} breathe />
            </div>
          </motion.div>
        </div>
      </header>

      {/* ── the problem ── */}
      <section className="border-y border-line bg-paper-2">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <h2 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
              Memory you can&rsquo;t inspect isn&rsquo;t a feature. It&rsquo;s a
              filing cabinet with someone else&rsquo;s lock on it.
            </h2>
            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-2">
              <p>
                Companion apps have converged on the same trick: quietly summarise
                what you say, store it somewhere you can&rsquo;t reach, and hope the
                recall feels like intimacy. When it gets something wrong about you,
                there is no line to cross out.
              </p>
              <p>
                Kithra runs the same machinery in the open. After each exchange it
                writes down what it thinks is worth keeping, and puts the note in
                front of you. Wrong note? Rewrite it. Regret it? Delete it. Matters
                more than the rest? Pin it, and it rides along in every future reply.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <LedgerDemo />
          </Reveal>
        </div>
      </section>

      {/* ── mechanics ── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            How it holds together
          </p>
          <h2 className="mt-4 max-w-2xl font-serif text-3xl leading-tight text-ink sm:text-4xl">
            The same design that makes memory visible is what keeps it cheap and
            keeps the character in character.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {[
            {
              n: "01",
              h: "A bounded context",
              p: "Only your pinned notes, the most recent notes, and the last twelve messages are sent. A conversation can run for a year and the request never grows past that ceiling.",
            },
            {
              n: "02",
              h: "A voice that holds",
              p: "Personality lives in a short, fixed contract rather than a sprawling prompt. Long persona instructions drift; a tight one survives the hundredth message as well as the first.",
            },
            {
              n: "03",
              h: "Extraction on the side",
              p: "A second, much smaller model reads each exchange and proposes notes after the reply has already reached you. It costs a fraction of a cent and never slows the conversation.",
            },
          ].map((c, i) => (
            <Reveal key={c.n} delay={i * 0.1}>
              <div className="border-t border-line pt-5">
                <span className="font-mono text-[11px] tracking-wider text-ember">
                  {c.n}
                </span>
                <h3 className="mt-3 font-serif text-xl text-ink">{c.h}</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{c.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── privacy ── */}
      <section className="border-y border-line bg-paper-2">
        <div className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
          <Reveal>
            <Mark size={38} className="mx-auto" />
            <h2 className="mt-7 font-serif text-3xl leading-tight text-ink sm:text-4xl">
              Your side of the conversation never touches our database.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">
              There is no database. Messages and notes live in your browser. The
              only thing that leaves your machine is the context assembled for a
              single reply, and it is never written down on the way through. Export
              the whole archive as JSON any time — or clear it in one click and
              leave nothing behind.
            </p>
            <Link
              href="/chat"
              className="mt-9 inline-block rounded-lg bg-ember px-6 py-3 text-[15px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              Start talking
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10">
        <Wordmark size={17} />
        <p className="font-mono text-[11px] tracking-wide text-muted">
          kith · the people who become familiar
        </p>
      </footer>
    </div>
  );
}
