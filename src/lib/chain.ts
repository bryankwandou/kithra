"use client";

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { Memory } from "./store";

/**
 * The on-chain half of Kithra.
 *
 * A ledger is worth more the longer you keep it, which makes it exactly the
 * kind of asset you should not have to leave behind when you change assistants.
 * Anchoring publishes a SHA-256 commitment over the ledger under your own key,
 * so you can later prove a given ledger is yours and that nobody has quietly
 * edited it. The text itself never goes anywhere near the chain.
 */

export const PROGRAM_ID = new PublicKey(
  "FJZb6EiwuqEui7jkVGYWSS7xQLzqMaSjpHSBwRdBiyyY",
);

export const LEDGER_SEED = new TextEncoder().encode("ledger");

export const DEVNET_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export const explorerAccount = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=devnet`;

/* ── commitment ───────────────────────────────────────────────────── */

/**
 * Canonical serialisation. Two devices holding the same ledger must produce
 * byte-identical input here, so entries are sorted by id and every field that
 * a verifier cares about is included. Changing this format changes every
 * previously published root, so it is versioned.
 */
export const LEDGER_FORMAT = "kithra-ledger-v1";

export function canonicalise(memories: Memory[]): string {
  const rows = [...memories]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => [m.id, m.kind, m.pinned ? "1" : "0", m.text.trim()].join(""));
  return [LEDGER_FORMAT, ...rows].join("");
}

export async function ledgerRoot(memories: Memory[]): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(canonicalise(memories));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export const toHex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

/* ── anchor instruction encoding ──────────────────────────────────────
   Discriminators are the first eight bytes of sha256("global:<name>"), which
   is what Anchor derives at build time. Computing them here keeps the whole
   Anchor client library out of the bundle for what amounts to two calls. */

async function discriminator(name: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(`global:${name}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest).slice(0, 8);
}

export function commitmentPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [LEDGER_SEED, owner.toBytes()],
    PROGRAM_ID,
  );
}

export async function buildCommitIx(
  owner: PublicKey,
  root: Uint8Array,
  entryCount: number,
): Promise<TransactionInstruction> {
  const [pda] = commitmentPda(owner);
  const disc = await discriminator("commit");

  // borsh: [u8;32] is written raw, u32 little-endian
  const data = new Uint8Array(8 + 32 + 4);
  data.set(disc, 0);
  data.set(root, 8);
  new DataView(data.buffer).setUint32(40, entryCount, true);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildRevokeIx(
  owner: PublicKey,
): Promise<TransactionInstruction> {
  const [pda] = commitmentPda(owner);
  const disc = await discriminator("revoke");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(disc),
  });
}

/* ── reading state back ───────────────────────────────────────────── */

export type OnChainCommitment = {
  owner: string;
  root: string;
  version: number;
  entryCount: number;
  updatedAt: number;
};

/** Layout: 8 discriminator, 32 owner, 32 root, 8 version, 4 count, 8 time, 1 bump. */
export async function fetchCommitment(
  connection: Connection,
  owner: PublicKey,
): Promise<OnChainCommitment | null> {
  const [pda] = commitmentPda(owner);
  const info = await connection.getAccountInfo(pda);
  if (!info || info.data.length < 93) return null;

  const d = info.data;
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);

  return {
    owner: new PublicKey(d.subarray(8, 40)).toBase58(),
    root: toHex(new Uint8Array(d.subarray(40, 72))),
    version: Number(view.getBigUint64(72, true)),
    entryCount: view.getUint32(80, true),
    updatedAt: Number(view.getBigInt64(84, true)),
  };
}

export type VerifyResult =
  | { state: "unanchored" }
  | { state: "match"; onChain: OnChainCommitment }
  | { state: "drifted"; onChain: OnChainCommitment; localRoot: string };

/** Compares the ledger in this browser against what the chain was told. */
export async function verify(
  connection: Connection,
  owner: PublicKey,
  memories: Memory[],
): Promise<VerifyResult> {
  const onChain = await fetchCommitment(connection, owner);
  if (!onChain) return { state: "unanchored" };

  const localRoot = toHex(await ledgerRoot(memories));
  return localRoot === onChain.root
    ? { state: "match", onChain }
    : { state: "drifted", onChain, localRoot };
}

export async function sendCommit(
  connection: Connection,
  owner: PublicKey,
  memories: Memory[],
  signAndSend: (tx: Transaction) => Promise<string>,
): Promise<{ signature: string; root: string }> {
  const root = await ledgerRoot(memories);
  const ix = await buildCommitIx(owner, root, memories.length);

  const tx = new Transaction().add(ix);
  tx.feePayer = owner;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signature = await signAndSend(tx);
  return { signature, root: toHex(root) };
}
