// Orchestrator Agent (AGENTS.md §6) - MVP.
// Vercel serverless function, same pattern as api/infer.js and api/decompose.js:
// the one place MISTRAL_API_KEY is allowed to live, since capture/frontend are
// static and must never hold API keys client-side.
//
// Implements the two-step pipeline specced in orchestrator/REVIEW.md §2-3: Step A
// (persona read) turns the user's persona state into a compact summary; Step B
// (reminder plan) takes that summary + the captured intent + reminder history and
// returns the structured plan the frontend renders. Kept as separate, explicit
// prompts per AGENTS.md §6's design constraint ("not one opaque call, so the
// Persona Agent's inference logic stays swappable"), but composed inside one
// Vercel endpoint (REVIEW.md §5, "Option 2 - recommended for MVP") so the frontend
// still only pays for one network round trip per check-in.
//
// api/infer.js remains untouched as a fallback/prior endpoint during the
// transition (REVIEW.md §4) - this file supersedes it as the frontend's primary
// call but does not remove it.
//
// MVP simplification (REVIEW.md §3, step 2): while persona.inferred_patterns is
// still empty (no Persona Agent inference pass writes it yet), Step A is skipped
// as an LLM call - the summary is built deterministically from onboarding_profile
// alone, the same persona-field-to-prior mapping api/infer.js already encodes.
// Step A only becomes a real LLM call once there's actual inferred_patterns data
// to synthesize.

const STEP_A_SYSTEM_PROMPT = `You are the Persona Read step for Blurt, an ADHD intent-capture companion.
Your input is one user's current persona state: their onboarding_profile
(what they told us at onboarding) and their inferred_patterns (what the
Persona Agent has learned from their behavior so far, with confidence scores).

Your job is to produce a concise context summary that the Reminder Plan step
will use as priors - NOT the full persona, NOT the reminder plan itself.

Be concise. The Reminder Plan step needs to know:
1. What moment priors to apply (primary_stall_point -> which of A/B/C/F gets a prior boost; avoidance_driver -> how to treat repeat stalls)
2. What framing prior the user stated (preferred_framing), and whether it's one of the two implemented modes (direct/inquiring) or one of the two not-yet-built modes (activation-only/silent-recovery)
3. What energy/receptivity signal to use (energy_windows)
4. What domains are drop-prone (drop_prone_domains), with special handling for self_care (never frame like a deadline)
5. How confident the persona is overall (low confidence -> treat priors as weak suggestions, not rules; the intent's own signal can override)

Rules:
- Persona fields absent or null carry NO signal. Do not invent values.
- inferred_patterns.confidence scores are per-field. If confidence is below 0.4 on a field, treat that field as a weak hint, not a strong prior.
- The summary field should be 1-2 plain-English sentences capturing the gist - this is what a future "why am I being reminded now" transparency layer may eventually surface, so keep it concrete and non-judgmental.
- NEVER output a reminder plan, scheduling decision, or copy. That's Step B's job.
- Return ONLY a JSON object with fields: moment_priors, framing_prior, energy_signal, drop_prone_domains, persona_confidence, summary. No other text.`;

const STEP_B_SYSTEM_PROMPT = `You are the Reminder Plan step for Blurt, an ADHD intent-capture companion.
Your input is one captured intent (raw text + lifecycle state), a persona
summary from the Persona Read step (your priors - not the full persona), and
reminder history for this intent (whether it's been reminded before, how many
follow-ups, what its current state is).

Your job is to produce a structured reminder plan: which of the six moments
(A/B/C/D/E/F) the user is most likely in right now, how urgent this feels,
what framing mode to use, a one-line "why am I being reminded now"
transparency note, and a schedule_hint the Reminder Agent can act on.

The six moments (from the app's detection table):
- A "don't know what to do" - vague capture, no named object ("ugh", "what now")
- B "know it, can't start" - named task, hesitation language, repeated unresolved
- C "started, got distracted" - previous intent in progress, new unrelated capture arrives (requires an active-task concept not built yet)
- D "too much in my head" - capture bursts, multiple intents in short time
- E "didn't do what I planned" - reminder fired, check-in returned "no" or ignored
- F "disappeared, now it's a mess" - gap in capture activity exceeds user's typical gap

Use the persona summary as PRIORS that the intent's own signal can override,
not hard rules:
- If primary_stall_point is "starting", boost prior toward moment B.
- If primary_stall_point is "deciding", boost prior toward moment A.
- If primary_stall_point is "finishing", boost prior toward moment C.
- If primary_stall_point is "remembering", boost prior toward moment F.
- If avoidance_driver is "dread", never raise urgency on repeat stalls of this kind; prefer "inquiring" over "direct"; treat the user dropping the item as a genuinely good outcome, not a failure.
- If avoidance_driver is "size", this is a decomposition candidate, not a repeat-reminder candidate; keep urgency low and note it in why if relevant.
- If avoidance_driver is "boredom", prefer framing that names the smallest next action rather than the whole task.
- If avoidance_driver is "timing", don't escalate framing on repeat stalls - the issue is when, not whether.
- If energy_windows is "bursts", do not treat elapsed clock time alone as rising urgency.
- If energy_windows is "rarely", keep urgency capped at "low" or "medium" and prefer "inquiring" framing; this user has said they can't absorb much intervention volume.
- If preferred_framing (from persona summary) is "direct" or "inquiring", use it as the starting framing prior - but the intent's own signal can override.
- If preferred_framing is "activation-only" or "silent-recovery" (not yet implemented), lean toward the closest available mode: "activation-only" -> lean "direct" but keep why concrete and action-first; "silent-recovery" -> lean "inquiring" and keep urgency low. Do NOT mention the approximation in why - "why" is read by the user, who does not know these mode names exist.
- If drop_prone_domains includes the intent's domain, that alone is NOT a reason to increase urgency. A missed self_care intent must NEVER be framed like a missed deadline.

Decision rules:
- Use "not_sure" for moment whenever the signal is genuinely too thin to pick confidently, especially for the confusable pairs A/C and B/E. Do NOT guess silently when unsure.
- When moment is "not_sure", set framing to null (not "direct" or "inquiring").
- urgency: "low", "medium", or "high" - base on stall_count, whether the task reads as time-sensitive, and the persona guidance above. A first-ever capture with no stall history is almost always "low".
- receptivity: "high", "low", or "unknown". Base on energy_windows and avoidance_driver if the persona summary has them. If persona_confidence is low and there's no interaction history, return "unknown" rather than inventing a signal.
- why: one short concrete sentence the user reads as "why am I being reminded now" - e.g. "This one has come back a few times", "You said you tend to forget this kind of thing", "You told me mornings are your good hours". Never generic ("It seems relevant"). Never use internal vocabulary (moment, framing, urgency, receptivity, persona, stall) - the user has never seen these words. Only claim what the input actually supports: you are given stall_count and captured_at, so do NOT invent time windows ("twice this week"), counts, or history you were not given. A vaguer true sentence beats a confident wrong one.
- schedule_hint: an object with window (a time-of-day hint from the persona summary's best_reminder_windows if available, else null), follow_up_count_max (a small number - 2 or 3 max for MVP; the Reminder Agent decides exact cadence), and reminder_style (one of "direct_check_in", "inquiring_check_in", "silent_recovery_fold_in", or null when moment is not_sure).
- decomposition_candidate: true if the intent text plausibly bundles multiple distinct sub-actions a person would do separately ("plan the birthday party", "clean out the garage"), false for atomic actions ("cut my nails", "call mom"). This is a signal for the decomposition flow, not a commitment to decompose.

Return ONLY a JSON object with fields: moment, urgency, receptivity, framing, why, schedule_hint, decomposition_candidate. No other text.`;

const BARE_PERSONA_SUMMARY = {
  moment_priors: {},
  framing_prior: null,
  energy_signal: null,
  drop_prone_domains: [],
  persona_confidence: 0,
  summary: "No persona data available.",
};

function hasInferredPatternData(inferredPatterns) {
  if (!inferredPatterns) return false;
  const { forget_triggers, best_reminder_windows, task_categories_prone_to_drop, confidence } = inferredPatterns;
  return (
    (forget_triggers?.length ?? 0) > 0 ||
    (best_reminder_windows?.length ?? 0) > 0 ||
    (task_categories_prone_to_drop?.length ?? 0) > 0 ||
    Object.keys(confidence ?? {}).length > 0
  );
}

// Deterministic, no-LLM-call persona summary for cold start (onboarding_profile
// only, no interaction_log/inferred_patterns yet) - avoids paying for a Step A
// call whose answer is fully determined by fields we already have in hand.
function bareSummaryFromOnboarding(onboardingProfile) {
  if (!onboardingProfile) return BARE_PERSONA_SUMMARY;

  const { primary_stall_point, avoidance_driver, energy_windows, preferred_framing, drop_prone_domains } =
    onboardingProfile;

  const momentPriors = {};
  if (primary_stall_point) momentPriors.primary_stall_point = primary_stall_point;
  if (avoidance_driver) momentPriors.avoidance_driver = avoidance_driver;

  const parts = [];
  if (primary_stall_point) parts.push(`User tends to stall at ${primary_stall_point}`);
  if (avoidance_driver) parts.push(`driven by ${avoidance_driver}`);
  if (energy_windows) parts.push(`energy comes in ${energy_windows} windows`);
  const summary = parts.length > 0 ? parts.join(", ") + "." : "No onboarding signal available.";

  return {
    moment_priors: momentPriors,
    framing_prior: preferred_framing ?? null,
    energy_signal: energy_windows ?? null,
    drop_prone_domains: drop_prone_domains ?? [],
    // Cold start: onboarding self-report only, no behavioral confirmation yet.
    persona_confidence: Object.keys(momentPriors).length > 0 ? 0.2 : 0,
    summary,
  };
}

async function callMistral(apiKey, systemPrompt, userPayload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`mistral request failed: ${detail}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

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

  const { intent, persona } = req.body || {};
  if (!intent?.text) {
    res.status(400).json({ error: "intent.text is required" });
    return;
  }

  const onboardingProfile = persona?.onboarding_profile ?? null;
  const inferredPatterns = persona?.inferred_patterns ?? null;

  try {
    // Step A - persona read. Only a real LLM call once there's inferred_patterns
    // data to synthesize; otherwise a deterministic summary from onboarding alone.
    const personaSummary = hasInferredPatternData(inferredPatterns)
      ? await callMistral(
          apiKey,
          STEP_A_SYSTEM_PROMPT,
          JSON.stringify({ onboarding_profile: onboardingProfile, inferred_patterns: inferredPatterns })
        )
      : bareSummaryFromOnboarding(onboardingProfile);

    // Step B - reminder plan. Always an LLM call; this is the actual intervention
    // decision and needs the intent's own signal, not just persona priors.
    const stepBInput = {
      intent: {
        id: intent.id ?? null,
        text: intent.text,
        captured_at: intent.captured_at ?? null,
        state: intent.state ?? null,
        stall_count: intent.stall_count ?? 0,
        resolution_status: intent.resolution_status ?? "unresolved",
        reminder_sent_at: intent.reminder_sent_at ?? null,
        follow_up_count: intent.follow_up_count ?? 0,
        parent_intent_id: intent.parent_intent_id ?? null,
        subtasks: intent.subtasks ?? [],
        category: intent.category ?? null,
      },
      persona_summary: personaSummary,
      reminder_history: {
        reminder_sent_at: intent.reminder_sent_at ?? null,
        follow_up_count: intent.follow_up_count ?? 0,
        resolution_status: intent.resolution_status ?? "unresolved",
        state: intent.state ?? null,
      },
    };

    const reminderPlan = await callMistral(apiKey, STEP_B_SYSTEM_PROMPT, JSON.stringify(stepBInput));

    res.status(200).json({ ...reminderPlan, persona_summary: personaSummary });
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    res
      .status(isAbort ? 504 : 500)
      .json({ error: isAbort ? "orchestrator request timed out" : "orchestrator failed", detail: String(err) });
  }
}
