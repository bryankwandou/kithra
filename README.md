# Kithra

A chat companion with a fixed personality and an open memory.

Most assistants keep a private file on you that you never get to read. Kithra
turns that file into a ledger you can open, correct, empty — and prove is yours,
by anchoring a hash of it to Solana under your own wallet.

---

## The idea

Three problems show up in every persistent-personality chatbot:

1. **Cost** — sending the whole conversation history on every request means the
   bill grows with the relationship.
2. **Drift** — the character forgets who it is somewhere around message eighty.
3. **Trust** — users have no way to see, correct, or delete what the system
   decided to keep about them.

The usual answer to (1) and (2) is a hidden summarisation layer. Kithra's bet is
that this layer should not be hidden at all. Making it visible solves (3) for
free, and turns the least trustworthy part of the product into the reason to use
it.

## How it works

```
you type
    │
    ▼
context assembled in the browser
    ├── persona contract        (short, fixed)
    ├── pinned memories         (always sent)
    ├── recent memories         (capped at 18)
    └── last 12 messages
    │
    ▼
POST /api/chat ──► Groq · llama-3.3-70b-versatile ──► streamed back token by token
    │
    ▼
reply lands, then in the background:
POST /api/remember ──► llama-3.1-8b-instant ──► proposes notes ──► your ledger
```

The context ceiling is the whole cost story: pinned notes + 18 recent notes +
12 messages. A conversation can run for a year and the request never grows past
that bound.

Extraction runs *after* the reply has already reached you, on the cheap model, so
the memory feature costs a fraction of a cent per exchange and never adds latency.

## Storage

There is no database. Messages and memories live in `localStorage`, keyed per
persona. The only thing that leaves the device is the context assembled for a
single reply.

To be exact about what that means: generating a reply requires sending the
assembled context to a model provider — Groq today — which sees those words in
order to answer, under its own retention terms. Our own servers keep no copy and
write nothing to disk. "Your words never leave the machine" would be a false
claim, so the product does not make it.

## Proof of ownership

Local-only storage fixes privacy and creates a new problem: nothing ties the file
to you, and nothing stops it being edited. Handing it back to a company to vouch
for would defeat the point of holding it.

So Kithra publishes a fingerprint instead. One press signs a SHA-256 hash of the
canonical ledger to Solana under your own wallet, with a version number and an
entry count. From any machine, the app recomputes the hash and compares.

```
memories ──► canonicalise (sorted, versioned format) ──► SHA-256
                                                            │
                                          32 bytes, no text ▼
                          PDA ["ledger", wallet] ──► kithra_ledger on Solana
```

Three properties the design is built around:

- **The chain never sees a word.** Only the digest is published; a hash does not
  run backwards into a sentence.
- **No company in the middle.** The record lives under your wallet, not a
  vendor's table. There is no account to be locked out of.
- **Erasure means erasure.** `revoke` closes the account and returns the rent, so
  deleting locally can also delete the on-chain shadow. A product that kept a
  permanent public trace would be lying about deletion.

### Devnet

| | |
| --- | --- |
| Program | [`FJZb6EiwuqEui7jkVGYWSS7xQLzqMaSjpHSBwRdBiyyY`](https://explorer.solana.com/address/FJZb6EiwuqEui7jkVGYWSS7xQLzqMaSjpHSBwRdBiyyY?cluster=devnet) |
| Deploy | [`58CANo…cmDnQ`](https://explorer.solana.com/tx/58CANondidvJuFXqfrLu7Nxt57wKt6unbkWCgE2K1fw1A3UcYMbgoHaYtdkSUWAgtUPYJhsu1bF8BLgftV5cmDnQ?cluster=devnet) |

`scripts/prove-devnet.mjs` runs the full lifecycle against the deployed program
and prints a signature for every transaction. A recent run:

| Step | Signature |
| --- | --- |
| Anchor a 3-entry ledger, version 1 | [`4ju5H4…AccvK`](https://explorer.solana.com/tx/4ju5H4ckW8U2GXYEpRTSePXFXSUi1omfSFqLJmFwjfM6RWLzfd2jPFufR6UvH27zgvhhmMEkC9bjevyP1qCAccvk?cluster=devnet) |
| Re-anchor an edited ledger, version 2 | [`5fS8zf…AiuGs`](https://explorer.solana.com/tx/5fS8zfGYY1mSuC3jqaA71vBJU1hDGFohX8YaCNgxY12uVPmDAHEmHRjRnUpsesjHXJd18PrnRW1iYKV8T8QAiuGs?cluster=devnet) |
| Revoke, rent returned | [`3pWRQw…EMFf`](https://explorer.solana.com/tx/3pWRQwNKojthCZ729M4qMtt7XZW8BcxifyY2Ao392EFQ2Q2cg4ATR3y65xW8LTASXWM6fdUJB2GPvgmey3moEMFf?cluster=devnet) |

It also checks the thing that matters most: change one word in one entry and the
recomputed root no longer matches what the chain was told.

```bash
cd chain && anchor build && cargo test -p kithra-ledger   # 8 tests, in-process SVM
node scripts/prove-devnet.mjs                             # live cluster
```

The Rust suite runs the compiled `.so` under [litesvm](https://github.com/LiteSVM/litesvm),
so a pass means the deployed bytecode behaves — not that a mock of it does. It
covers first commit, version increment, rejection of an all-zero root, per-wallet
isolation, a forged write against someone else's PDA, revoke, and re-anchoring
after revoke.

### Sync

Memory does not follow you between browsers, by construction. Moving to Postgres
behind an auth layer is the obvious next step for anyone who wants sync;
`src/lib/store.ts` is deliberately the only file that would need to change, and
the commitment gives a synced copy something to be checked against.

## Running it

```bash
npm install
cp .env.example .env.local     # add your Groq key
npm run dev
```

Get a key at [console.groq.com/keys](https://console.groq.com/keys).

| Variable | Required | Default |
| --- | --- | --- |
| `GROQ_API_KEY` | yes | — |
| `KITHRA_MODEL` | no | `llama-3.3-70b-versatile` |
| `KITHRA_EXTRACT_MODEL` | no | `llama-3.1-8b-instant` |

## Layout

```
src/
├── app/
│   ├── page.tsx              landing
│   ├── chat/page.tsx         the app
│   └── api/
│       ├── chat/             streaming reply
│       └── remember/         memory extraction
├── components/
│   ├── Logo.tsx              the knot mark
│   ├── MemoryPanel.tsx       the ledger
│   └── AnchorPanel.tsx       hash, anchor, verify, revoke
└── lib/
    ├── persona.ts            three voice contracts
    ├── store.ts              local-first storage + context assembly
    ├── chain.ts              canonicalisation, PDA, instruction encoding
    ├── wallet.ts             Phantom / Solflare, no adapter dependency
    └── ratelimit.ts          per-IP token bucket

chain/
└── programs/kithra-ledger/
    ├── src/
    │   ├── lib.rs            two instructions: commit, revoke
    │   ├── state.rs          the 93-byte Commitment account
    │   └── instructions/     one file each
    └── tests/commitment.rs   litesvm suite

scripts/prove-devnet.mjs      live-cluster lifecycle proof
```

`lib/chain.ts` encodes the two instructions by hand — an eight-byte Anchor
discriminator plus Borsh fields — rather than pulling the Anchor client into the
browser bundle. For two instructions with four fields between them, the library
costs far more than it saves.

## Known limits

- **Rate limiting is per warm serverless instance**, not global. It blunts casual
  abuse; it is not a real quota. Swap the two map operations in `ratelimit.ts`
  for Redis before this matters.
- **Memory extraction is imperfect.** The small model sometimes keeps something
  trivial or phrases a note oddly. That is precisely why every row is editable.
- **No sync across devices**, by construction. See *Storage* above.
- **The commitment proves integrity, not authorship.** It shows a ledger is
  unchanged since you anchored it and that your key anchored it. It cannot show
  the entries were ever true, and nothing stops someone anchoring a ledger they
  copied from you — what they cannot do is anchor it under your key.
- **Devnet only.** Nothing here has been audited for mainnet, and the account
  layout is not yet frozen across versions.

## Name

*Kith* — from Old English *cȳþþu*, the people who have become familiar to you.
The half of "kith and kin" that you choose rather than inherit.

## Licence

MIT
