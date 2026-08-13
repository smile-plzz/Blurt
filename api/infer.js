// Orchestrator Agent, step 4 (AGENTS.md) - MVP.
// Vercel serverless function: the one place a secret (MISTRAL_API_KEY) is allowed to
// live, since capture/frontend are static and must never hold API keys client-side.
// Full product deployment moves this to Render later (per roadmap decision,
// 2026-08-10 follow-up) - this MVP stays on Vercel intentionally.
//
// Implements "Option A" from the roadmap's Section 3.7: one LLM call per check-in
// returns moment + urgency + receptivity + framing together, rather than the
// decomposed rule-based signals (Option B). All four of Section 3.3's framing modes
// are now offered: activation-only and silent-recovery copy exists in the frontend
// (framingCopy in frontend/web/app.js), so the earlier constraint to direct/inquiring
// - and the instruction to approximate the other two with the nearest built mode -
// is gone. Onboarding Q8 lets a user pick any of the four; approximating their answer
// was the app quietly not doing what it said it would.
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
"inquiring", "activation-only", or "silent-recovery"). All four are implemented, so any of \
them can be returned as stated - overriding a stated preference needs a reason from this \
intent, not a default. The one exception: only return "activation-only" if you can name a \
real smallest next action for this intent (see "activation_step" below); if you cannot, \
return "direct" rather than the mode without its step.
- typical_intent_class: what this user typically puts off. "small_annoying"->the barrier is \
starting, not understanding: keep urgency low, never treat it as a decomposition candidate, \
prefer "direct" or "activation-only" over asking whether it still matters. "big_vague"->a \
size stall: keep urgency low, avoid "direct" on the whole task (restating something big and \
vague is what already failed), prefer "activation-only" when a real first action is nameable, \
else "inquiring". "for_someone_else"->a real external dependency makes time-sensitivity more \
likely genuine, so trust the intent's own timing signal, but never use the other person as \
leverage - obligation must not appear in "why". "mixed"->no discriminating signal; treat as \
absent.
- stated_goal: what the user said would make the app worth keeping. "catching_things"->they \
measure success as not losing things, not as finishing them: keep urgency low, prefer \
"inquiring", and treat a dropped item as a fully good outcome. "finishing_things"->they want \
closure on a few things rather than movement on all of them: prefer framings that produce a \
next action on this one item, and don't raise urgency to compensate for anything else that is \
open. "feeling_less_behind"->volume is the problem, so never imply it: no counts, no pile, \
nothing in "why" suggesting other things are waiting; cap urgency at "medium" and prefer \
"silent-recovery" or "inquiring" on repeat stalls. "one_specific_thing"->something specific \
matters more than the rest, but you see one intent at a time and cannot tell if this is it, so \
don't assume it is: keep urgency low unless this intent's own text is time-sensitive.
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
- "framing": "direct", "inquiring", "activation-only", "silent-recovery", or null. Use null \
whenever moment is "not_sure" - signal too thin to name the situation is too thin to pick a \
tone for it. Never return any other value. What each mode does: "direct" plainly states the \
task; "inquiring" asks whether it still matters; "activation-only" shows ONLY the smallest \
next physical action and never the task itself (for a named task stalled two or more times, \
where restating the whole thing is the intervention that already failed); "silent-recovery" \
sends no individual check-in at all and folds the item into the user's next catch-up session \
instead (for when receptivity is low - backing off a channel, never a punishment). With \
"silent-recovery", keep urgency "low".
- "activation_step": required when framing is "activation-only", null otherwise. One short \
imperative sentence (under about 12 words) naming the smallest physical action that starts \
this task - something doable in under two minutes without deciding anything ("Open the lecture \
tab.", "Put the form by your keys."). It must be derivable from the intent text; if the text \
does not say enough to name a real first action, do NOT invent one - return "direct" instead. \
The user sees this sentence as the entire instruction, so a plausible-sounding wrong step is \
worse than a plain restatement of the task. Never restate the whole task here.
- "why": one short sentence the user reads as "why am I being reminded now" - concrete, \
not generic (e.g. "This one has come back a few times", not "It seems relevant"). Never use \
internal vocabulary (moment, framing, urgency, receptivity, persona, stall); the user has never \
seen those words. Only claim what the input supports - do not invent time windows, counts or \
history you were not given.

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
        drop_prone_domains: persona.drop_prone_domains ?? [],
        // Collected at onboarding (Q2 and Q10) and stored, but never forwarded
        // until now - the prompt above has a behavioral rule for each value, so
        // they're priors like the rest rather than fields carried for their own sake.
        typical_intent_class: persona.typical_intent_class ?? null,
        stated_goal: persona.stated_goal ?? null
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
