"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Transaction } from "@solana/web3.js";
import {
  buildRevokeIx,
  explorerAccount,
  explorerTx,
  ledgerRoot,
  sendCommit,
  toHex,
  verify,
  commitmentPda,
  type VerifyResult,
} from "@/lib/chain";
import { connection, useWallet } from "@/lib/wallet";
import type { Memory } from "@/lib/store";

const short = (s: string, n = 6) => `${s.slice(0, n)}…${s.slice(-4)}`;

export default function AnchorPanel({ memories }: { memories: Memory[] }) {
  const { pubkey, available, connecting, connect, disconnect, signAndSend, error, setError } =
    useWallet();

  const [localRoot, setLocalRoot] = useState<string>("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState<null | "commit" | "verify" | "revoke">(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  // Recompute the local hash whenever the ledger changes, so the panel always
  // reflects what *would* be published rather than what was published last.
  useEffect(() => {
    let alive = true;
    ledgerRoot(memories).then((r) => {
      if (alive) setLocalRoot(toHex(r));
    });
    return () => {
      alive = false;
    };
  }, [memories]);

  const runVerify = useCallback(async () => {
    if (!pubkey) return;
    setBusy("verify");
    setError(null);
    try {
      setResult(await verify(connection(), pubkey, memories));
    } catch {
      setError("Could not reach devnet. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }, [pubkey, memories, setError]);

  useEffect(() => {
    if (pubkey) void runVerify();
  }, [pubkey, runVerify]);

  async function anchorNow() {
    if (!pubkey) return;
    setBusy("commit");
    setError(null);
    try {
      const { signature } = await sendCommit(
        connection(),
        pubkey,
        memories,
        signAndSend,
      );
      setLastSig(signature);
      await connection().confirmTransaction(signature, "confirmed");
      await runVerify();
    } catch (e) {
      setError(
        e instanceof Error && /insufficient|0x1\b/i.test(e.message)
          ? "Not enough devnet SOL to pay rent. Fund the wallet and retry."
          : "The transaction did not go through.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function revokeNow() {
    if (!pubkey) return;
    if (!confirm("Remove the on-chain record entirely and reclaim its rent?")) return;
    setBusy("revoke");
    setError(null);
    try {
      const ix = await buildRevokeIx(pubkey);
      const tx = new Transaction().add(ix);
      tx.feePayer = pubkey;
      tx.recentBlockhash = (await connection().getLatestBlockhash()).blockhash;
      const sig = await signAndSend(tx);
      setLastSig(sig);
      await connection().confirmTransaction(sig, "confirmed");
      await runVerify();
    } catch {
      setError("Could not revoke. The record may already be gone.");
    } finally {
      setBusy(null);
    }
  }

  const pda = pubkey ? commitmentPda(pubkey)[0].toBase58() : null;

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-[15px] text-ink">Proof of ownership</h3>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
          solana devnet
        </span>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        Publishes a hash of this ledger under your key. The text stays here.
      </p>

      <div className="mt-3 space-y-1">
        <Line label="local" value={localRoot ? short(localRoot, 8) : "—"} />
        {result?.state === "match" && (
          <Line label="chain" value={short(result.onChain.root, 8)} tone="ok" />
        )}
        {result?.state === "drifted" && (
          <Line label="chain" value={short(result.onChain.root, 8)} tone="warn" />
        )}
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.p
            key={result.state}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-[11px] leading-relaxed"
          >
            {result.state === "unanchored" && (
              <span className="text-muted">Nothing published yet.</span>
            )}
            {result.state === "match" && (
              <span className="text-sage">
                Verified. This ledger matches version {result.onChain.version} on
                chain, {result.onChain.entryCount} entries.
              </span>
            )}
            {result.state === "drifted" && (
              <span className="text-ember">
                Changed since version {result.onChain.version}. Anchor again to
                record the current state.
              </span>
            )}
          </motion.p>
        )}
      </AnimatePresence>

      {!pubkey ? (
        <button
          onClick={() => void connect()}
          disabled={connecting}
          className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-[12px] text-ink transition-colors hover:border-ember hover:text-ember disabled:opacity-50"
        >
          {connecting ? "Waiting for wallet…" : available ? "Connect wallet" : "Install Phantom"}
        </button>
      ) : (
        <>
          <div className="mt-3 flex gap-1.5">
            <button
              onClick={() => void anchorNow()}
              disabled={busy !== null || memories.length === 0}
              className="flex-1 rounded-lg bg-ember px-3 py-2 text-[12px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              {busy === "commit" ? "Signing…" : "Anchor now"}
            </button>
            <button
              onClick={() => void runVerify()}
              disabled={busy !== null}
              className="rounded-lg border border-line px-3 py-2 text-[12px] text-ink transition-colors hover:border-ember hover:text-ember disabled:opacity-40"
            >
              {busy === "verify" ? "…" : "Verify"}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
            <button onClick={() => void disconnect()} className="hover:text-ember">
              {short(pubkey.toBase58())}
            </button>
            {pda && (
              <a
                href={explorerAccount(pda)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-ember"
              >
                record ↗
              </a>
            )}
            {lastSig && (
              <a
                href={explorerTx(lastSig)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-ember"
              >
                last tx ↗
              </a>
            )}
            {result?.state !== "unanchored" && result && (
              <button onClick={() => void revokeNow()} className="hover:text-ember">
                {busy === "revoke" ? "…" : "revoke"}
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="mt-2 text-[11px] leading-relaxed text-ember">{error}</p>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "ok" | "warn";
}) {
  return (
    <div className="flex items-center justify-between font-mono text-[10px]">
      <span className="uppercase tracking-wider text-muted">{label}</span>
      <span
        className={
          tone === "ok" ? "text-sage" : tone === "warn" ? "text-ember" : "text-ink-2"
        }
      >
        {value}
      </span>
    </div>
  );
}
