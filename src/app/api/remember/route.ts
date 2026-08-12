import { clientIp, takeToken } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 20;

const GROQ = "https://api.groq.com/openai/v1/chat/completions";
// Extraction is a small, mechanical job — the cheap model does it well enough
// and keeps the per-message cost of the memory feature close to nothing.
const MODEL = process.env.KITHRA_EXTRACT_MODEL ?? "llama-3.1-8b-instant";

const KINDS = ["fact", "preference", "event", "person"] as const;
type Kind = (typeof KINDS)[number];

const PROMPT = `You pull durable facts out of a conversation so a companion can recall them weeks later.

Return JSON: {"memories":[{"text":"...","kind":"fact|preference|event|person"}]}

Record only things that will still be true and still be worth knowing next month:
- fact — stable details about their life, work, situation
- preference — likes, dislikes, how they want to be treated
- event — something happening in their life with a before and after
- person — someone in their life and who that person is to them

Write each in the third person, under 15 words, and self-contained enough to make
sense on its own months from now.

Attribution matters more than phrasing. Facts about the person you are talking to
start with "They". Facts about someone else in their life name that person and
their relationship instead — "Their sister Mira starts medical school in March",
never "They start medical school in March". Getting this wrong puts a false
statement in front of the user, which is worse than recording nothing.

Record nothing for: small talk, passing moods, the mechanics of the current conversation,
anything the assistant said about itself, or anything already in the known list.
Returning an empty array is the correct answer most of the time.`;

export async function POST(req: Request) {
  // Same BOM/whitespace guard as the chat route — see the note there.
  const key = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim() || "";
  if (!key) return Response.json({ memories: [] });

  if (!takeToken(clientIp(req)).ok) return Response.json({ memories: [] });

  let body: {
    exchange: { role: string; content: string }[];
    known: string[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ memories: [] });
  }

  const transcript = (body.exchange ?? [])
    .map((m) => `${m.role === "user" ? "Them" : "Assistant"}: ${m.content}`)
    .join("\n");

  if (!transcript.trim()) return Response.json({ memories: [] });

  const known = (body.known ?? []).slice(-40);

  try {
    const res = await fetch(GROQ, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content: `Already known:\n${known.length ? known.map((k) => `- ${k}`).join("\n") : "(nothing yet)"}\n\nConversation:\n${transcript}`,
          },
        ],
      }),
    });

    if (!res.ok) return Response.json({ memories: [] });

    const raw = (await res.json())?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const candidates: unknown[] = Array.isArray(parsed?.memories)
      ? parsed.memories
      : [];

    const memories = candidates
      .filter((m): m is { text: string; kind?: string } =>
        Boolean(m && typeof (m as { text?: unknown }).text === "string"),
      )
      .map((m: { text: string; kind?: string }) => ({
        text: m.text.trim().slice(0, 160),
        kind: (KINDS as readonly string[]).includes(m.kind ?? "")
          ? (m.kind as Kind)
          : ("fact" as Kind),
      }))
      .filter((m) => m.text.length > 3)
      .slice(0, 4);

    return Response.json({ memories });
  } catch (err) {
    // Extraction is best-effort: a failure here must never break the chat.
    console.error("extraction failed", err);
    return Response.json({ memories: [] });
  }
}
