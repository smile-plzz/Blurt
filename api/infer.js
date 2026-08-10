// Orchestrator Agent, step 4 (AGENTS.md) - MVP.
// Vercel serverless function: the one place a secret (MISTRAL_API_KEY) is allowed to
// live, since capture/frontend are static and must never hold API keys client-side.
// Full product deployment moves this to Render later (per roadmap decision,
// 2026-08-10 follow-up) - this MVP stays on Vercel intentionally.
//
// Implements "Option A" from the roadmap's Section 3.7: one LLM call per check-in
// returns moment + urgency + receptivity + framing together, rather than the
// decomposed rule-based signals (Option B). Framing is deliberately constrained to
// direct/inquiring only - activation-only/silent-recovery copy hasn't been drafted
// yet (roadmap Section 3.3's copy-drafting-order decision), so the model is not
// offered those as options.
//
// No persona/interaction_log store exists yet, so "receptivity" has no real history
// to draw on - the model is told this explicitly and expected to return "unknown"
// rather than guess. This is a known, temporary limitation until the Persona Agent
// exists.

const SYSTEM_PROMPT = `You are the intervention decision engine for Blurt, a voice-first \
ADHD intent-capture app. You are given one captured intent's fields and must classify it \
per the app's six-moment detection table and intervention design.

The six moments: A "don't know what to do" (vague capture, no named object), B "know it, \
can't start" (named task, hesitation language, repeated unresolved), C "started, got \
distracted" (needs an active-task concept this system does not track yet), D "too much in \
my head" (capture bursts), E "didn't do what I planned" (repeat check-in "no"s), F \
"disappeared, now it's a mess" (long capture gap).

Return ONLY a JSON object with these fields:
- "moment": one of "A","B","C","D","E","F","not_sure". Use "not_sure" whenever the signal \
is genuinely too thin to pick confidently, especially for the confusable pairs A/C and B/E \
- per the roadmap's explicit decision, do not guess silently when unsure.
- "urgency": "low", "medium", or "high", based on how many times the intent has stalled and \
whether the task itself reads as time-sensitive.
- "receptivity": "high", "low", or "unknown". No interaction history is provided to you yet \
(no persona/interaction_log store exists), so return "unknown" rather than inventing a signal.
- "framing": "direct", "inquiring", or null. Use null whenever moment is "not_sure". \
Only "direct" and "inquiring" are implemented - never return any other framing value.
- "why": one short sentence a user could read as "why am I being reminded now" - concrete, \
not generic (e.g. "You mentioned this twice this week", not "It seems relevant").

Respond with JSON only, no other text.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "MISTRAL_API_KEY not configured" });
    return;
  }

  const { text, state, stall_count, captured_at, resolution_status } = req.body || {};
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const userPayload = JSON.stringify({ text, state, stall_count, captured_at, resolution_status });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPayload },
        ],
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const detail = await response.text();
      res.status(502).json({ error: "mistral request failed", detail });
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    let decision;
    try {
      decision = JSON.parse(content);
    } catch {
      res.status(502).json({ error: "mistral returned non-JSON content", raw: content });
      return;
    }

    res.status(200).json(decision);
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    res.status(isAbort ? 504 : 500).json({ error: isAbort ? "mistral request timed out" : "infer failed", detail: String(err) });
  }
}
