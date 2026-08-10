// Orchestrator Agent, step 6 (AGENTS.md) - task decomposition, MVP.
// Vercel serverless function, same pattern as api/infer.js: the one place allowed
// to hold MISTRAL_API_KEY. Called once, when the user opens an intent that has no
// parent and no subtasks yet - decomposition is judged on demand, never at capture
// time (roadmap decomposition decisions, #1/#2). AI-judgment-only for v1: no manual
// "break this down" trigger, per Ismail's 2026-08-10 decision - keep it simple.

const SYSTEM_PROMPT = `You judge whether a captured intent for Blurt (a voice-first \
ADHD intent-capture app) genuinely contains multiple steps or clearly related \
sub-actions, as opposed to being a single atomic action.

Examples that are NOT decomposable (single atomic action): "cut my nails", "reply to \
landlord's email", "call mom".
Examples that ARE decomposable (multiple real steps): "plan the birthday party", \
"clean out the garage", "set up the new apartment".

Be conservative - most captures are atomic. Only propose decomposition when the intent \
clearly bundles several distinct sub-actions a person would actually do separately.

If decomposable, propose 3 to 6 short subtask texts, each phrased the way a person would \
actually say it out loud (not formal instructions, not numbered steps as prose).

Respond with JSON only: {"decomposable": true|false, "subtasks": ["...", "..."]}. \
subtasks must be an empty array when decomposable is false.`;

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

  const { text } = req.body || {};
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

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
          { role: "user", content: JSON.stringify({ text }) },
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
    res.status(isAbort ? 504 : 500).json({ error: isAbort ? "mistral request timed out" : "decompose failed", detail: String(err) });
  }
}
