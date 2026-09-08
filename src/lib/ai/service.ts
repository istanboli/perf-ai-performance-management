import { PROMPT_VERSION, AiSystemSchema, type AiSystem } from "./schema";

const SYSTEM_PROMPT = `You are a senior performance-management consultant (KPI/OKR architect), not a chatbot.
Product: AI KPI & OKR Architect. Designed & Created by Yassin Astanboli.

Rules you must never break:
- Distinguish USER FACTS, ASSUMPTIONS, AI RECOMMENDATIONS, and MISSING INFORMATION.
- Never invent industry benchmarks, historical values, company performance, financials, or employee results.
- Never present a target as a fact without a baseline the user provided.
- If a benchmark is unavailable, say "Insufficient data to establish a reliable benchmark."
- Do not treat every KPI as a Key Result. A KPI may support an objective without being a KR.
- Fewer, better, strategically relevant, measurable indicators. You may say "This is not a good KPI" or "You do not need another KPI here."
- Ask at most 3 follow-up questions. If enough is known, set interview_complete=true and design the system.
- Prefer quality, guardrails, and anti-gaming over volume metrics.
- Keep the design small: at most 4 objectives, 6 key results, 8 KPIs.
- Select frameworks only when they help (OKR, Balanced Scorecard, SMART, Parmenter KRI/RI/PI/KPI, leading/lagging). Explain why.
- Return ONLY valid JSON matching the schema. No markdown.

Return JSON with keys as needed:
system_summary, follow_up_questions (max 3), interview_complete,
assumptions, missing_information, recommendations,
objectives[], key_results[], kpis[], modifier_explanation, kpi_patches[].
KPI objects: name, definition, purpose, formula, unit, direction, owner, dataSource, guardrail, relatedObjective, leadingLagging, parmenterType.`;

const GENERATE_PROMPT = `You are a senior performance-management consultant for AI KPI & OKR Architect, Designed & Created by Yassin Astanboli. Never invent benchmarks or actuals.
Return ONLY JSON with keys objectives (array of {title}), key_results (array of {name,objectiveTitle}), kpis (array of {name,definition,formula,owner,dataSource,direction,guardrail}). Max 4 kpis. No markdown.`;

const INTERVIEW_PROMPT = `You are a senior performance-management consultant for AI KPI & OKR Architect, Designed & Created by Yassin Astanboli. Never invent benchmarks or actuals.
Ask at most 3 follow-up questions only if a decision-critical fact is missing. Return ONLY JSON: {"follow_up_questions":[{"id":"","prompt":"","promptAr":""}],"interview_complete":false}. Max 3 questions. No markdown.`;

export async function runArchitect(opts: {
  kind: "interview" | "generate" | "modify" | "audit";
  payload: unknown;
  timeoutMs?: number;
}): Promise<{ ok: true; data: AiSystem; raw: string } | { ok: false; error: string }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI is not available in this environment" };

  const user = JSON.stringify({
    prompt_version: PROMPT_VERSION,
    kind: opts.kind,
    payload: opts.payload,
    instruction:
      opts.kind === "generate"
        ? "Interview is finished. interview_complete=true. Do not ask follow-up questions. Return compact JSON with objectives, key_results and kpis now (max 4 / 6 / 8). Each KPI needs name, definition, formula, owner, dataSource, direction."
        : opts.kind === "interview"
          ? "Ask at most 3 follow-up questions only if needed. Timeout or failure must not set interview_complete. Max 3 questions."
          : undefined,
  });

  const timeoutMs = opts.timeoutMs ?? (opts.kind === "generate" ? 25000 : 8000);
  const system =
    opts.kind === "generate" ? GENERATE_PROMPT : opts.kind === "interview" ? INTERVIEW_PROMPT : SYSTEM_PROMPT;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.2,
        max_tokens: opts.kind === "generate" ? 1800 : 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = body.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "AI returned invalid JSON. Nothing was saved." };
    }
    const data = AiSystemSchema.safeParse(parsed);
    if (!data.success) {
      return { ok: false, error: "AI output failed validation. Database was not changed." };
    }
    return { ok: true, data: data.data, raw };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      error: timedOut
        ? "AI request timed out. The local architect will design from your facts."
        : "AI request failed. The local architect can still design from the library.",
    };
  }
}

export { PROMPT_VERSION };
