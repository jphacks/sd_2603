import { z } from "zod";
import type { JudgeInput, JudgeProvider, JudgeResult } from "./types";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const DEFAULT_MODEL = "typesafe-ai/jev";
const QUESTION_VERSION = "v1";
const TIMEOUT_MS = 5000;
const INTERVENTION_THRESHOLD = 0.6;
const UNCERTAIN_THRESHOLD = 0.4;

const AnswerSchema = z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) });
const ResponseSchema = z.object({
  model: z.string(),
  answers: z.object({
    drifted: AnswerSchema,
    stalled: AnswerSchema,
    tangentIsRelevant: AnswerSchema,
  }),
});
type Scores = { drifted: number; stalled: number; tangentIsRelevant: number };

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

function questions() {
  return {
    drifted: {
      type: "noul",
      instructions: "Have the recent utterances moved away from the meeting agenda to a topic that does not help accomplish it?",
      criteria: {
        true: "The current topic is unrelated to the agenda and is not supplying a useful fact, risk, or constraint.",
        false: "The discussion is on the agenda or is a useful temporary detour that will feed back into it.",
      },
    },
    stalled: {
      type: "noul",
      instructions: "Are participants repeating the same points without new information, options, or progress toward the agenda?",
      criteria: {
        true: "The same arguments recur without progress toward a decision.",
        false: "New information, options, or decisions are emerging, or a decision is not yet being sought.",
      },
    },
    tangentIsRelevant: {
      type: "noul",
      instructions: "Does the current side topic directly help the meeting agenda?",
      criteria: {
        true: "The side topic checks a relevant fact, risk, dependency, or past example and should be allowed to continue.",
        false: "The side topic does not help accomplish the agenda.",
      },
    },
  } as const;
}

export function decideFromScores(scores: Scores): JudgeResult {
  if (scores.stalled >= INTERVENTION_THRESHOLD) {
    return { action: "INTERVENE", reason: "Discussion appears stalled", message: "一度、ここまでの意見を整理してみませんか？" };
  }
  if (scores.drifted >= INTERVENTION_THRESHOLD && scores.tangentIsRelevant < INTERVENTION_THRESHOLD) {
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
    scores: { drifted: answers.drifted.noul, stalled: answers.stalled.noul, tangentIsRelevant: answers.tangentIsRelevant.noul },
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
