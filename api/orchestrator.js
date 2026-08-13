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
2. What framing prior the user stated (preferred_framing). All four modes - direct, inquiring, activation-only, silent-recovery - are implemented and can be passed through as stated; none needs approximating.
3. What energy/receptivity signal to use (energy_windows)
4. What domains are drop-prone (drop_prone_domains), with special handling for self_care (never frame like a deadline)
5. What kind of thing the user typically puts off (typical_intent_class) and what they said they want out of the app (stated_goal) - both shape how much intervention is appropriate, not just its tone
6. How confident the persona is overall (low confidence -> treat priors as weak suggestions, not rules; the intent's own signal can override)

Rules:
- Persona fields absent or null carry NO signal. Do not invent values.
- inferred_patterns.confidence scores are per-field. If confidence is below 0.4 on a field, treat that field as a weak hint, not a strong prior.
- The summary field should be 1-2 plain-English sentences capturing the gist - this is what a future "why am I being reminded now" transparency layer may eventually surface, so keep it concrete and non-judgmental.
- NEVER output a reminder plan, scheduling decision, or copy. That's Step B's job.
- Return ONLY a JSON object with fields: moment_priors, framing_prior, energy_signal, drop_prone_domains, typical_intent_class, stated_goal, persona_confidence, summary. No other text.`;

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

The four framing modes, all of them implemented in the UI:
- "direct" - plainly states the task ("Open the lecture."). Best for a named task with low ambiguity.
- "inquiring" - asks whether it still matters ("Still on your mind, or can this go?"). Best for stalled or ageing items; treats letting go as a valid answer.
- "activation-only" - the screen shows ONLY the smallest next physical action and never the task itself. Best for something named but stalled two or more times, where restating the whole task is the intervention that has already failed. Requires activation_step (below); do not choose this framing unless you can name that one action from the intent text without guessing.
- "silent-recovery" - no individual check-in at all; the item folds into the user's next Recovery Mode session instead. Best when receptivity is low - this is the app's way of backing off a channel rather than pushing harder on it. Not a punishment and never framed as one.

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
- preferred_framing (from persona summary) is the user's own answer to "what helps when a reminder lands and you haven't done the thing", and any of the four values is a real starting prior you can return as-is. The intent's own signal can still override it - but overriding a stated preference needs a reason from this intent, not a default. If it is "activation-only" and you cannot name a genuine smallest action for this particular intent, fall back to "direct" rather than returning "activation-only" without an activation_step.
- If drop_prone_domains includes the intent's domain, that alone is NOT a reason to increase urgency. A missed self_care intent must NEVER be framed like a missed deadline.
- If typical_intent_class is "small_annoying", the barrier is starting, not understanding: never treat these as decomposition candidates, keep urgency low (annoying is not urgent), and prefer "direct" or "activation-only" over asking whether it still matters.
- If typical_intent_class is "big_vague", this user's stalls are size stalls: treat as a decomposition candidate rather than a repeat-reminder candidate, keep urgency low, and avoid "direct" on the whole task - restating something big and vague is the thing that already failed. Prefer "activation-only" when you can name a real first action, otherwise "inquiring".
- If typical_intent_class is "for_someone_else", a real external dependency makes time-sensitivity more likely genuine, so trust the intent's own timing signal - but never use the other person as leverage; obligation to someone else must not appear in why. Keep "inquiring" available so letting go stays a real option.
- If typical_intent_class is "mixed", it carries no discriminating signal. Treat it as absent and rely on the intent's own text.
- If stated_goal is "catching_things", the user measures success as not losing things, not as finishing them: keep urgency low, prefer "inquiring", and treat a dropped item as a fully successful outcome rather than something to re-raise.
- If stated_goal is "finishing_things", the user wants closure on a few things rather than movement on all of them: prefer framings that produce a next action ("activation-only", then "direct") on this one item, and do not raise urgency to compensate for anything else that is open.
- If stated_goal is "feeling_less_behind", volume is the problem, so never imply it: no counts, no pile, nothing in why that suggests other things are waiting. Cap urgency at "medium", and on any repeat stall prefer "silent-recovery" or "inquiring" - for this user, one quiet item at a time IS the intervention.
- If stated_goal is "one_specific_thing", something specific matters more than the rest, but you are shown one intent at a time and cannot tell whether this is it. So do not assume it is: keep urgency low unless this intent's own text is time-sensitive, and prefer framings that offer a next step over ones that press for an answer.

Decision rules:
- Use "not_sure" for moment whenever the signal is genuinely too thin to pick confidently, especially for the confusable pairs A/C and B/E. Do NOT guess silently when unsure.
- framing: one of "direct", "inquiring", "activation-only", "silent-recovery", or null. All four are implemented; never return any other value.
- When moment is "not_sure", set framing to null - if the signal is too thin to name the situation, it is too thin to pick a tone for it.
- activation_step: required when framing is "activation-only", null otherwise. One short imperative sentence (under about 12 words) naming the smallest physical action that starts this task - something a person could do in under two minutes without deciding anything ("Open the lecture tab.", "Put the form by your keys."). It must be derivable from the intent text: if the text does not say enough to name a real first action, do NOT invent one - return "direct" as the framing instead. The user sees this sentence as the entire instruction, so a plausible-sounding wrong step is worse than a plain restatement of the task.
- When framing is "activation-only", the activation_step must not restate the whole task, and must not be a paragraph. One action, one sentence.
- When framing is "silent-recovery", keep urgency "low", and write why as an explanation of the quiet, not an apology for it. The item is not being dropped; it comes back through the user's next catch-up session.
- urgency: "low", "medium", or "high" - base on stall_count, whether the task reads as time-sensitive, and the persona guidance above. A first-ever capture with no stall history is almost always "low".
- receptivity: "high", "low", or "unknown". Base on energy_windows and avoidance_driver if the persona summary has them. If persona_confidence is low and there's no interaction history, return "unknown" rather than inventing a signal.
- why: one short concrete sentence the user reads as "why am I being reminded now" - e.g. "This one has come back a few times", "You said you tend to forget this kind of thing", "You told me mornings are your good hours". Never generic ("It seems relevant"). Never use internal vocabulary (moment, framing, urgency, receptivity, persona, stall) - the user has never seen these words. Only claim what the input actually supports: you are given stall_count and captured_at, so do NOT invent time windows ("twice this week"), counts, or history you were not given. A vaguer true sentence beats a confident wrong one.
- schedule_hint: an object with window (a time-of-day hint from the persona summary's best_reminder_windows if available, else null), follow_up_count_max (a small number - 2 or 3 max for MVP; the Reminder Agent decides exact cadence), and reminder_style (one of "direct_check_in", "inquiring_check_in", "activation_only_check_in", "silent_recovery_fold_in", or null when moment is not_sure). reminder_style must match framing: direct -> direct_check_in, inquiring -> inquiring_check_in, activation-only -> activation_only_check_in, silent-recovery -> silent_recovery_fold_in. For silent_recovery_fold_in set follow_up_count_max to 0 - the point of that mode is that no individual follow-up is sent at all.
- decomposition_candidate: true if the intent text plausibly bundles multiple distinct sub-actions a person would do separately ("plan the birthday party", "clean out the garage"), false for atomic actions ("cut my nails", "call mom"). This is a signal for the decomposition flow, not a commitment to decompose.

Return ONLY a JSON object with fields: moment, urgency, receptivity, framing, activation_step, why, schedule_hint, decomposition_candidate. No other text.`;

const BARE_PERSONA_SUMMARY = {
  moment_priors: {},
  framing_prior: null,
  energy_signal: null,
  drop_prone_domains: [],
  typical_intent_class: null,
  stated_goal: null,
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

  // typical_intent_class and stated_goal were collected at onboarding and stored,
  // but were never destructured out here - so they reached this endpoint in the
  // request body and then stopped, and Step B never saw them. They are priors of
  // the same kind as the rest (see STEP_B_SYSTEM_PROMPT's rules for each value),
  // so they travel in the summary under their own names rather than being folded
  // into moment_priors, which is specifically about which moment to lean toward.
  const {
    primary_stall_point,
    avoidance_driver,
    energy_windows,
    preferred_framing,
    drop_prone_domains,
    typical_intent_class,
    stated_goal,
  } = onboardingProfile;

  const momentPriors = {};
  if (primary_stall_point) momentPriors.primary_stall_point = primary_stall_point;
  if (avoidance_driver) momentPriors.avoidance_driver = avoidance_driver;

  const parts = [];
  if (primary_stall_point) parts.push(`User tends to stall at ${primary_stall_point}`);
  if (avoidance_driver) parts.push(`driven by ${avoidance_driver}`);
  if (energy_windows) parts.push(`energy comes in ${energy_windows} windows`);
  if (typical_intent_class) parts.push(`what they put off is typically ${typical_intent_class}`);
  if (stated_goal) parts.push(`what they want from the app is ${stated_goal}`);
  const summary = parts.length > 0 ? parts.join(", ") + "." : "No onboarding signal available.";

  return {
    moment_priors: momentPriors,
    framing_prior: preferred_framing ?? null,
    energy_signal: energy_windows ?? null,
    drop_prone_domains: drop_prone_domains ?? [],
    typical_intent_class: typical_intent_class ?? null,
    stated_goal: stated_goal ?? null,
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
