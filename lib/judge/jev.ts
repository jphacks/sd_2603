import { z } from "zod";
import policyJson from "./jev-policy.json" with { type: "json" };
import type { JudgeInput, JudgeProvider, JudgeResult } from "./types";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const DEFAULT_MODEL = "typesafe-ai/jev-1.14.0";

const TIMEOUT_MS = 5000;
export const QuestionVersionSchema = z.enum(["v1", "v2", "v3"]);
export type QuestionVersion = z.infer<typeof QuestionVersionSchema>;
const ThresholdSchema = z.number().finite().min(0).max(1);
export const JevPolicySchema = z.object({
  questionVersion: QuestionVersionSchema,
  driftThreshold: ThresholdSchema,
  stallThreshold: ThresholdSchema,
  relevanceThreshold: ThresholdSchema,
  uncertainThreshold: ThresholdSchema,
}).strict();
export type JevPolicy = z.infer<typeof JevPolicySchema>;
export const BASELINE_POLICY: Readonly<JevPolicy> = Object.freeze({
  questionVersion: "v1", driftThreshold: 0.6, stallThreshold: 0.6,
  relevanceThreshold: 0.6, uncertainThreshold: 0.4,
});
export const JEV_POLICY: Readonly<JevPolicy> = Object.freeze(JevPolicySchema.parse(policyJson));

const AnswerSchema = z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) });
const ResponseSchema = z.object({
  model: z.string(),
  usage: z.record(z.string(), z.unknown()).optional(),
  answers: z.object({
    drifted: AnswerSchema,
    stalled: AnswerSchema,
    tangentIsRelevant: AnswerSchema,
  }),
});
export type Scores = { drifted: number; stalled: number; tangentIsRelevant: number };

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

export function questions(version: QuestionVersion = JEV_POLICY.questionVersion) {
  QuestionVersionSchema.parse(version);
  const baseline = {
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
  if (version === "v1") return baseline;
  const criteria = {
    drifted: {
      ...baseline.drifted,
      instructions: "Evaluate the recent conversation against the explicit agenda and meeting phase. Score topical departure, separately from whether the departure is useful. A new speaker or long utterance alone is not drift.",
      criteria: {
        true: "Several recent turns sustain a different topic without returning to the current agenda. Judge the latest state, not a historical detour already resolved.",
        false: "Participants address the agenda, clarify its scope, or have already returned to it. An explicitly permitted short break or icebreaker is not problematic departure.",
      },
    },
    stalled: {
      ...baseline.stalled,
      instructions: "Evaluate lack of progress within the current meeting phase, independently of topical drift. Require observable repetition, unresolved blockage, or explicit prolonged unproductive silence; never infer silence duration from missing text.",
      criteria: {
        true: "Repeated claims or questions add no information, alternatives, criteria, decisions or next steps; the same unresolved obstacle recurs without a plan.",
        false: "Brainstorming adds distinct options; summarizing clarifies an issue; disagreement compares evidence; a scheduled thinking pause, fact check, or assigned follow-up advances the process.",
      },
    },
    tangentIsRelevant: {
      ...baseline.tangentIsRelevant,
      instructions: "Evaluate the instrumental usefulness of a side topic to this agenda: identify a concrete link to a decision, risk, dependency, constraint, or next step. Do not confuse shared vocabulary with usefulness.",
      criteria: {
        true: "The detour supplies actionable evidence, a relevant analogy, a dependency or risk, or a bounded exploration with an explicit return path to the agenda.",
        false: "The side topic has no concrete benefit to the agenda; personal chat, a settled issue or excessive detail crowds out the current objective. If no side topic exists, use low relevance; low relevance alone must not imply intervention.",
      },
    },
  };
  if (version === "v2") return criteria;
  // Authored examples only: these are not taken from the held-out evaluation set.
  const examples = {
    drifted: " Examples: budget meeting shifts into several turns about weekend movies => high; budget discussion compares supplier costs => low; team returns from movies to the budget => judge the return, low.",
    stalled: " Examples: repeated A-versus-B preferences with no criteria or next step => high; participants add different prototype ideas during brainstorming => low; a stated two-minute calculation pause => low.",
    tangentIsRelevant: " Examples: release-date meeting checks a previous outage to decide readiness => high; discusses a movie with no decision link => low; checks an API dependency and states how it changes the release date => high.",
  };
  return Object.fromEntries(Object.entries(criteria).map(([key, value]) => [key, {
    ...value, instructions: value.instructions + examples[key as keyof typeof examples],
  }]));
}

export function decideFromScores(scores: Scores, policy: JevPolicy = JEV_POLICY): JudgeResult {
  JevPolicySchema.parse(policy);
  if (scores.stalled >= policy.stallThreshold) {
    return { action: "INTERVENE", reason: "Discussion appears stalled", message: "一度、ここまでの意見を整理してみませんか？" };
  }
  if (scores.drifted >= policy.driftThreshold && scores.tangentIsRelevant < policy.relevanceThreshold) {
    return { action: "INTERVENE", reason: "Discussion appears off agenda", message: "そろそろ議題に戻りませんか？" };
  }
  if (scores.drifted >= policy.uncertainThreshold || scores.stalled >= policy.uncertainThreshold) {
    return { action: "WAIT", reason: "Conversation needs more observation", message: null };
  }
  return { action: "SILENCE", reason: "Conversation is progressing", message: null };
}

export async function requestJevScores(
  input: JudgeInput,
  options: { fetch?: typeof fetch; apiKey?: string; model?: string; questionVersion?: QuestionVersion } = {},
): Promise<{ scores: Scores; model: string; latencyMs: number; questionVersion: QuestionVersion; usage?: Record<string, unknown> }> {
  const apiKey = options.apiKey ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new JevError("config", "AI_GATEWAY_API_KEY is not configured");
  const model = options.model ?? process.env.JEV_MODEL_ID ?? DEFAULT_MODEL;
  const questionVersion = QuestionVersionSchema.parse(options.questionVersion ?? JEV_POLICY.questionVersion);
  const started = performance.now();
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, state: { agenda: input.agenda, conversation: input.transcript }, questions: questions(questionVersion) }),
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
    questionVersion,
    ...(parsed.data.usage ? { usage: parsed.data.usage } : {}),
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
  return { ...decideFromScores(decision.scores), diagnostic: { ...decision.scores, model: decision.model, latencyMs: decision.latencyMs, questionVersion: decision.questionVersion } };
};
