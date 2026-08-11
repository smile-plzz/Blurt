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
// offered those as options even though the persona can now prefer one of them.
//
// Persona-as-prior (added 2026-08-11): the onboarding question flow
// (frontend/mockups/Blurt Onboarding Question Flow.dc.html) writes ten fields to
// schema/persona.json 0.2.0 specifically to shape this decision - each question's
// own "Changes:" line documents what it's supposed to do here. Wiring resumed once
// that persona store existed; the "no persona store yet" limitation this file used
// to note is gone, but there is still no interaction_log, so "receptivity" is a
// same-session estimate from persona + the current intent, not learned history yet.

const SYSTEM_PROMPT = `You are the intervention decision engine for Blurt, a voice-first \
ADHD intent-capture app. You are given one captured intent's fields, plus that user's \
onboarding persona (may be partial or absent), and must classify the intent per the app's \
six-moment detection table and intervention design.

The six moments: A "don't know what to do" (vague capture, no named object), B "know it, \
can't start" (named task, hesitation language, repeated unresolved), C "started, got \
distracted" (needs an active-task concept this system does not track yet), D "too much in \
my head" (capture bursts), E "didn't do what I planned" (repeat check-in "no"s), F \
"disappeared, now it's a mess" (long capture gap).

How to use each persona field, if present (treat all as priors that the intent's own \
signal can override, not hard rules):
- primary_stall_point: "starting"->prior toward moment B. "deciding"->prior toward moment \
A. "finishing"->prior toward moment C. "remembering"->prior toward moment F.
- avoidance_driver: "dread"->never raise urgency on repeat stalls of this kind, prefer \
"inquiring" over "direct", and treat the user dropping the item as a genuinely good \
outcome, not a failure to push back on. "size"->this task is a decomposition candidate, \
not a repeat-reminder candidate; keep urgency low and note that in "why" if relevant. \
"boredom"->prefer framing that names the smallest next action rather than the whole task. \
"timing"->don't escalate framing on repeat stalls, the issue is when, not whether.
- energy_windows: "bursts"->do not treat elapsed clock time alone as rising urgency. \
"rarely"->keep urgency capped at "low" or "medium" and prefer the gentler "inquiring" \
framing; this user has said they can't absorb much intervention volume.
- preferred_framing: the user's own stated preference from onboarding (Q8: "direct", \
"inquiring", "activation-only", or "silent-recovery"). Only "direct" and "inquiring" are \
implemented in the UI - if the stored preference is "activation-only", lean "direct" but \
keep the "why" concrete and action-first; if it's "silent-recovery", lean "inquiring" and \
keep urgency low, since neither of those two modes is built yet and this is the closest \
available approximation, not a match.
- drop_prone_domains: if the intent's text plausibly matches one of the user's stated \
drop-prone domains (work_study, home_admin, people, self_care), that alone is not a reason \
to increase urgency - a missed self_care intent in particular must never be framed like a \
missed deadline.
Persona fields absent or null carry no signal - fall back to the intent's own fields alone, \
exactly as this system did before onboarding existed.

Return ONLY a JSON object with these fields:
- "moment": one of "A","B","C","D","E","F","not_sure". Use "not_sure" whenever the signal \
is genuinely too thin to pick confidently, especially for the confusable pairs A/C and B/E \
- per the roadmap's explicit decision, do not guess silently when unsure.
- "urgency": "low", "medium", or "high", based on how many times the intent has stalled, \
whether the task itself reads as time-sensitive, and the persona guidance above.
- "receptivity": "high", "low", or "unknown". Base this on persona.energy_windows and \
avoidance_driver if present (see above); otherwise there is still no interaction_log to \
draw on, so return "unknown" rather than inventing a signal.
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

  const { text, state, stall_count, captured_at, resolution_status, persona } = req.body || {};
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  // Only the fields this prompt actually uses as priors - never forward the whole
  // persona object (interaction_log, active_clarifications, etc. aren't relevant here
  // and there's no reason to send more of the user's data than the call needs).
  const personaContext = persona
    ? {
        primary_stall_point: persona.primary_stall_point ?? null,
        avoidance_driver: persona.avoidance_driver ?? null,
        energy_windows: persona.energy_windows ?? null,
        preferred_framing: persona.preferred_framing ?? null,
        drop_prone_domains: persona.drop_prone_domains ?? []
      }
    : null;

  const userPayload = JSON.stringify({ text, state, stall_count, captured_at, resolution_status, persona: personaContext });

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
