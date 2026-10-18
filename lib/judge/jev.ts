import { z } from "zod";
import policy from "./jev-policy.json" with { type: "json" };
import tunedQuestions from "./jev-questions.json" with { type: "json" };
import type { JudgeInput, JudgeProvider, JudgeResult } from "./types";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const DEFAULT_MODEL = "typesafe-ai/jev-1.14.0";
const QUESTION_VERSION = policy.questionVersion;
const TIMEOUT_MS = 5000;
const INTERVENTION_THRESHOLD = policy.interventionThreshold;
const UNCERTAIN_THRESHOLD = policy.uncertainThreshold;

const AnswerSchema = z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) });
const ResponseSchema = z.object({
  model: z.string(),
  answers: z.object({
    drifted: AnswerSchema,
    stalled: AnswerSchema,
    tangentIsRelevant: AnswerSchema,
    interveneNow: AnswerSchema,
  }),
});
type Scores = { drifted: number; stalled: number; tangentIsRelevant: number; interveneNow: number };

export class JevError extends Error {
  readonly kind: "config" | "auth" | "rate_limit" | "timeout" | "upstream" | "invalid_response";
  constructor(
    kind: JevError["kind"],
    message: string,
  ) {
    super(message);
    this.name = "JevError";
    this.kind = kind;
  }
}

export function questions() {
  return {
    ...tunedQuestions,
    interveneNow: {
      type: "noul",
      instructions: "Would a brief facilitator remark help the meeting right now, rather than interrupt a useful or harmless moment?",
      criteria: {
        true: "The discussion has stayed off agenda or stuck across multiple turns without progress, and a short nudge would help it move forward.",
        false: "A side topic has only just begun, is useful to the agenda, or follows a completed decision or agreed break; there is no need to speak yet.",
      },
    },
  } as const;
}

export function decideFromScores(scores: Scores): JudgeResult {
  if (scores.stalled >= policy.stallThreshold && scores.interveneNow >= INTERVENTION_THRESHOLD) {
    return { action: "INTERVENE", reason: "Discussion appears stalled", message: "一度、ここまでの意見を整理してみませんか？" };
  }
  if (scores.drifted >= policy.driftThreshold && scores.tangentIsRelevant < policy.relevanceThreshold && scores.interveneNow >= INTERVENTION_THRESHOLD) {
    return { action: "INTERVENE", reason: "Discussion appears off agenda", message: "そろそろ議題に戻りませんか？" };
  }
  if (scores.drifted >= UNCERTAIN_THRESHOLD || scores.stalled >= UNCERTAIN_THRESHOLD) {
    return { action: "WAIT", reason: "Conversation needs more observation", message: null };
  }
  return { action: "SILENCE", reason: "Conversation is progressing", message: null };
}

export async function requestJevScores(
  input: JudgeInput,
  options: { fetch?: typeof fetch; apiKey?: string; model?: string } = {},
): Promise<{ scores: Scores; model: string; latencyMs: number }> {
  const apiKey = options.apiKey ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new JevError("config", "AI_GATEWAY_API_KEY is not configured");
  const model = options.model ?? process.env.JEV_MODEL_ID ?? DEFAULT_MODEL;
  const started = performance.now();
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, state: { agenda: input.agenda, conversation: input.transcript }, questions: questions() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new JevError("timeout", "Jev request timed out");
    }
    throw new JevError("upstream", "Jev request failed");
  }
  if (!response.ok) {
    const kind = response.status === 401 || response.status === 403 ? "auth"
      : response.status === 429 ? "rate_limit" : "upstream";
    throw new JevError(kind, `Jev returned HTTP ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new JevError("invalid_response", "Jev response is not JSON");
  }
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) throw new JevError("invalid_response", "Jev response has an unexpected shape");
  const { answers } = parsed.data;
  return {
    scores: { drifted: answers.drifted.noul, stalled: answers.stalled.noul, tangentIsRelevant: answers.tangentIsRelevant.noul, interveneNow: answers.interveneNow.noul },
    model: parsed.data.model,
    latencyMs: Math.round(performance.now() - started),
  };
}

export const jevJudge: JudgeProvider = async (input) => {
  if (input.secondsSinceLastIntervention < 60) {
    return { action: "SILENCE", reason: "Cooldown active", message: null };
  }
  if (input.transcript.length < 3) {
    return { action: "WAIT", reason: "Not enough conversation", message: null };
  }
  const decision = await requestJevScores(input);
  return { ...decideFromScores(decision.scores), diagnostic: { ...decision.scores, model: decision.model, latencyMs: decision.latencyMs, questionVersion: QUESTION_VERSION } };
};
