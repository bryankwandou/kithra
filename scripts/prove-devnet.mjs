/**
 * End-to-end proof against live devnet.
 *
 * The litesvm suite proves the bytecode is correct in isolation. This proves
 * the deployed program, the PDA derivation, the hand-rolled Borsh encoding in
 * src/lib/chain.ts, and the account layout the app reads back all agree with
 * each other on a real cluster. Every signature it prints is checkable in an
 * explorer, which is the only form of "it works on chain" worth anything.
 *
 *   node scripts/prove-devnet.mjs
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("FJZb6EiwuqEui7jkVGYWSS7xQLzqMaSjpHSBwRdBiyyY");
const LEDGER_SEED = new TextEncoder().encode("ledger");
const RPC = "https://api.devnet.solana.com";
const LEDGER_FORMAT = "kithra-ledger-v1";

/* ── the same canonical form the browser uses ──────────────────────── */

function canonicalise(memories) {
  const rows = [...memories]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => [m.id, m.kind, m.pinned ? "1" : "0", m.text.trim()].join(""));
  return [LEDGER_FORMAT, ...rows].join("");
}

async function ledgerRoot(memories) {
  const bytes = new TextEncoder().encode(canonicalise(memories));
  return new Uint8Array(await webcrypto.subtle.digest("SHA-256", bytes));
}

const toHex = (b) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

async function discriminator(name) {
  const bytes = new TextEncoder().encode(`global:${name}`);
  return new Uint8Array(await webcrypto.subtle.digest("SHA-256", bytes)).slice(0, 8);
}

const pdaFor = (owner) =>
  PublicKey.findProgramAddressSync([LEDGER_SEED, owner.toBytes()], PROGRAM_ID)[0];

/* ── instructions ─────────────────────────────────────────────────── */

async function commitIx(owner, root, entryCount) {
  const data = new Uint8Array(8 + 32 + 4);
  data.set(await discriminator("commit"), 0);
  data.set(root, 8);
  new DataView(data.buffer).setUint32(40, entryCount, true);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pdaFor(owner), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

async function revokeIx(owner) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pdaFor(owner), isSigner: false, isWritable: true },
    ],
    data: Buffer.from(await discriminator("revoke")),
  });
}

/** Layout: 8 discriminator, 32 owner, 32 root, 8 version, 4 count, 8 time, 1 bump. */
async function fetchCommitment(connection, owner) {
  const info = await connection.getAccountInfo(pdaFor(owner));
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

/* ── the run ──────────────────────────────────────────────────────── */

const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const LEDGER = [
  { id: "m1", kind: "preference", pinned: true, text: "They want criticism first, encouragement second" },
  { id: "m2", kind: "fact", pinned: false, text: "They are rebuilding their portfolio site in Next.js" },
  { id: "m3", kind: "person", pinned: false, text: "Their sister Mira starts medical school in March" },
];

let failures = 0;
function check(label, passed, detail = "") {
  console.log(`  ${passed ? "pass" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!passed) failures++;
}

async function send(connection, payer, ix) {
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
}

const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8"))),
);
const connection = new Connection(RPC, "confirmed");

console.log(`program  ${PROGRAM_ID.toBase58()}`);
console.log(`wallet   ${wallet.publicKey.toBase58()}`);
console.log(`record   ${pdaFor(wallet.publicKey).toBase58()}\n`);

// Start from a clean slate so the version assertions below mean something.
if (await fetchCommitment(connection, wallet.publicKey)) {
  await send(connection, wallet, await revokeIx(wallet.publicKey));
  console.log("cleared a record left over from a previous run\n");
}

console.log("1. anchoring a three-entry ledger");
const root1 = await ledgerRoot(LEDGER);
const sig1 = await send(connection, wallet, await commitIx(wallet.publicKey, root1, LEDGER.length));
console.log(`   ${explorer(sig1)}`);

const c1 = await fetchCommitment(connection, wallet.publicKey);
check("the account exists", c1 !== null);
check("owner is the signer", c1?.owner === wallet.publicKey.toBase58());
check("root matches the local hash", c1?.root === toHex(root1), c1?.root.slice(0, 16) + "…");
check("version starts at 1", c1?.version === 1);
check("entry count is 3", c1?.entryCount === 3);
check("timestamp is a real cluster time", c1?.updatedAt > 1_700_000_000, new Date((c1?.updatedAt ?? 0) * 1000).toISOString());

console.log("\n2. editing one word must break verification");
const tampered = LEDGER.map((m) =>
  m.id === "m3" ? { ...m, text: "Their sister Mira starts law school in March" } : m,
);
const rootT = toHex(await ledgerRoot(tampered));
check("the altered ledger no longer matches the chain", rootT !== c1?.root, rootT.slice(0, 16) + "…");

console.log("\n3. re-anchoring the altered ledger bumps the version");
const sig2 = await send(
  connection,
  wallet,
  await commitIx(wallet.publicKey, await ledgerRoot(tampered), tampered.length),
);
console.log(`   ${explorer(sig2)}`);
const c2 = await fetchCommitment(connection, wallet.publicKey);
check("version incremented to 2", c2?.version === 2);
check("root was replaced", c2?.root === rootT);
check("the previous root is no longer current", c2?.root !== c1?.root);

console.log("\n4. revoking erases the on-chain record");
const before = await connection.getBalance(wallet.publicKey);
const sig3 = await send(connection, wallet, await revokeIx(wallet.publicKey));
console.log(`   ${explorer(sig3)}`);
const after = await connection.getBalance(wallet.publicKey);
check("the account is gone", (await fetchCommitment(connection, wallet.publicKey)) === null);
check("rent came back to the owner", after > before, `+${((after - before) / 1e9).toFixed(6)} SOL net of fees`);

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
