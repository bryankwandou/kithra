# Kithra

A chat companion with a fixed personality and an open memory.

Most companion apps keep a private file on you that you never get to read. Kithra
turns that file into a page you can open, correct, and empty whenever you like —
and it never leaves your browser.

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
single reply, and the server never writes it down.

That is a real product decision, not a shortcut — it is what makes the privacy
claim on the landing page true. It also means memory does not follow you between
browsers. Moving to Postgres behind an auth layer is the obvious next step for
anyone who wants sync; `src/lib/store.ts` is deliberately the only file that
would need to change.

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
│   └── MemoryPanel.tsx       the ledger
└── lib/
    ├── persona.ts            three voice contracts
    ├── store.ts              local-first storage + context assembly
    └── ratelimit.ts          per-IP token bucket
```

## Known limits

- **Rate limiting is per warm serverless instance**, not global. It blunts casual
  abuse; it is not a real quota. Swap the two map operations in `ratelimit.ts`
  for Redis before this matters.
- **Memory extraction is imperfect.** The small model sometimes keeps something
  trivial or phrases a note oddly. That is precisely why every row is editable.
- **No sync across devices**, by construction. See *Storage* above.

## Name

*Kith* — from Old English *cȳþþu*, the people who have become familiar to you.
The half of "kith and kin" that you choose rather than inherit.

## Licence

MIT
