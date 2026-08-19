import { getPersona } from "@/lib/persona";
import { clientIp, takeToken } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.KITHRA_MODEL ?? "llama-3.3-70b-versatile";

type Incoming = {
  personaId: string;
  history: { role: "user" | "assistant"; content: string }[];
  memories: { text: string; kind: string; pinned: boolean }[];
};

/** The persona contract plus everything it is allowed to remember. */
function buildSystem(personaId: string, memories: Incoming["memories"]) {
  const persona = getPersona(personaId);

  if (!memories.length) {
    return `${persona.system}

You have not learned anything about this person yet. Don't pretend otherwise, and don't interrogate them — let details come up naturally.`;
  }

  const pinned = memories.filter((m) => m.pinned);
  const rest = memories.filter((m) => !m.pinned);

  const lines = [
    ...(pinned.length
      ? ["Things this person has marked as important:", ...pinned.map((m) => `- ${m.text}`), ""]
      : []),
    ...(rest.length
      ? ["Other things you've learned about them:", ...rest.map((m) => `- ${m.text}`)]
      : []),
  ];

  return `${persona.system}

${lines.join("\n")}

Use what you know when it's genuinely relevant. Do not recite these facts back at them or open by listing what you remember — that reads as a party trick. If something here contradicts what they tell you now, believe what they tell you now.`;
}

/** Keys pasted from a file often carry a BOM or stray whitespace, and either one
 *  makes the Authorization header throw before the request is even sent. */
const cleanKey = () =>
  process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim() || "";

export async function POST(req: Request) {
  const key = cleanKey();
  if (!key) {
    return Response.json(
      { error: "GROQ_API_KEY is not set on the server." },
      { status: 500 },
    );
  }

  const gate = takeToken(clientIp(req));
  if (!gate.ok) {
    return Response.json(
      { error: `Slow down a moment — try again in ${gate.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  let body: Incoming;
  try {
    body = (await req.json()) as Incoming;
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const history = (body.history ?? []).slice(-12);
  if (!history.length) {
    return Response.json({ error: "Nothing to reply to." }, { status: 400 });
  }

  const upstream = await fetch(GROQ, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      temperature: 0.75,
      max_tokens: 700,
      messages: [
        { role: "system", content: buildSystem(body.personaId, body.memories ?? []) },
        ...history,
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    // Deliberately not logging the upstream body. A provider error can echo a
    // fragment of the prompt back, and the landing page promises that none of a
    // conversation is written down here. The status code is the diagnostic part.
    console.error("groq chat failed", upstream.status);
    return Response.json(
      { error: "The model is unreachable right now." },
      { status: 502 },
    );
  }

  // Re-emit the SSE payload as plain text deltas so the client stays trivial.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              /* partial frame — the next chunk completes it */
            }
          }
        }
      } catch (err) {
        console.error("stream interrupted", err);
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
