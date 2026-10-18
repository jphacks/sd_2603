import { randomUUID } from "node:crypto";
import type { JudgeResult } from "../judge/types";

export class RecommendationCancelledError extends Error {}

type Context = { botId: string; agenda: string; agendaVersion: string };
const TTL_MS = 20_000;
const MAX_BOTS = 32;

/** Short-lived, process-local authorization for the worker's deferred display. */
export function createRecommendationStore(now = Date.now) {
  const entries = new Map<string, Context & { id: string; expiresAt: number; result: JudgeResult | null }>();
  const prune = () => {
    for (const [botId, value] of entries) if (value.expiresAt <= now()) entries.delete(botId);
  };
  return {
    begin(context: Context) {
      prune();
      entries.delete(context.botId);
      if (entries.size >= MAX_BOTS) entries.delete(entries.keys().next().value!);
      const id = randomUUID();
      entries.set(context.botId, { ...context, id, expiresAt: now() + TTL_MS, result: null });
      return id;
    },
    complete(context: Context, id: string, result: JudgeResult) {
      prune();
      const value = entries.get(context.botId);
      if (!value || value.id !== id || value.agenda !== context.agenda || value.agendaVersion !== context.agendaVersion) {
        throw new RecommendationCancelledError("Evaluation superseded");
      }
      value.result = structuredClone(result);
      value.expiresAt = now() + TTL_MS;
    },
    read(context: Context, id: string): JudgeResult {
      prune();
      const value = entries.get(context.botId);
      if (!value || !value.result || value.id !== id || value.agenda !== context.agenda || value.agendaVersion !== context.agendaVersion) {
        throw new RecommendationCancelledError("Recommendation expired or superseded");
      }
      return structuredClone(value.result);
    },
    invalidate(botId: string) { entries.delete(botId); },
  };
}

export function assertDisplayControls(
  result: JudgeResult,
  controls: { mutedUntil: number | null; lastIntervenedAt: number | null },
  now = Date.now(),
) {
  // A manual override is trusted only when read back from this server's store.
  if (result.manual === true) return;
  if (controls.mutedUntil !== null && controls.mutedUntil > now) {
    throw new RecommendationCancelledError("Tangent marked useful");
  }
  if (controls.lastIntervenedAt !== null && now - controls.lastIntervenedAt < 60_000) {
    throw new RecommendationCancelledError("Cooldown active");
  }
}

const host = globalThis as typeof globalThis & { __recallRecommendations?: ReturnType<typeof createRecommendationStore> };
export const recommendationStore = host.__recallRecommendations ??= createRecommendationStore();
