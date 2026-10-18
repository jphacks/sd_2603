import type { JudgeInput, JudgeResult } from "../judge/types";
import { ScoreSchema, expectedInterval } from "./schema.ts";
import type { Envelope, Snapshot } from "./schema.ts";

const codes: Record<string, Snapshot["reasonCode"]> = {
  "Cooldown active": "COOLDOWN",
  "Not enough conversation": "INSUFFICIENT_CONTEXT",
  "Discussion appears stalled": "STALLED",
  "Discussion appears off agenda": "DRIFTED_IRRELEVANT",
  "Conversation needs more observation": "OBSERVE",
  "Conversation is progressing": "ON_TOPIC",
};
export function createMonitorStore(now = Date.now) {
  const sessions = new Map<string, { data: Envelope; touched: number }>();
  let activeSessionId: string | null = null;
  const ended = new Set<string>();
  function entry(id: string) {
    const time = now();
    for (const [key, value] of sessions)
      if (time - value.touched > 600000) sessions.delete(key);
    let value = sessions.get(id);
    if (!value) {
      if (sessions.size >= 32) sessions.delete(sessions.keys().next().value!);
      value = {
        data: { snapshot: null, history: [], expectedIntervalMs: null },
        touched: time,
      };
      sessions.set(id, value);
    }
    value.touched = time;
    return value.data;
  }
  return {
    activate(id: string) {
      entry(id);
      ended.delete(id);
      activeSessionId = id;
    },
    deactivate(id: string) {
      if (activeSessionId === id) activeSessionId = null;
      ended.add(id);
      if (ended.size > 32) ended.delete(ended.values().next().value!);
    },
    activeSession() {
      if (activeSessionId && !sessions.has(activeSessionId)) activeSessionId = null;
      return activeSessionId;
    },
    read(id: string): Envelope {
      const data = entry(id);
      data.history = data.history
        .filter((point) => point.at >= now() - 60000)
        .slice(-240);
      return structuredClone(data);
    },
    record(id: string, input: JudgeInput, result: JudgeResult) {
      const data = entry(id);
      // CLI/worker meetings can begin evaluating without the web join endpoint.
      if ((!activeSessionId || activeSessionId === "judge") && !ended.has(id)) activeSessionId = id;
      const previous = data.snapshot;
      const sequence = (previous?.sequence ?? 0) + 1;
      const scores = ScoreSchema.safeParse(result.diagnostic);
      if (scores.success)
        data.history.push({ sequence, at: now(), scores: scores.data });
      data.history = data.history
        .filter((point) => point.at >= now() - 60000)
        .slice(-240);
      data.expectedIntervalMs =
        expectedInterval(data.history) ?? data.expectedIntervalMs;
      data.snapshot = {
        schemaVersion: 1,
        sessionId: id,
        streamId: previous?.streamId ?? crypto.randomUUID(),
        sequence,
        evaluatedAt: now(),
        scores: scores.success ? scores.data : (previous?.scores ?? null),
        scoresAt: scores.success ? now() : (previous?.scoresAt ?? null),
        scoreSequence: scores.success
          ? sequence
          : (previous?.scoreSequence ?? 0),
        decision: result.action,
        reason: result.reason,
        reasonCode: codes[result.reason] ?? "OTHER",
        transcriptCount: input.transcript.length,
        lastIntervenedAt: previous?.lastIntervenedAt ?? null,
        cooldownUntil: previous?.cooldownUntil ?? null,
      };
    },
    intervened(id: string) {
      const data = entry(id);
      if (data.snapshot) {
        data.snapshot.lastIntervenedAt = now();
        data.snapshot.cooldownUntil = now() + 60000;
        data.snapshot.sequence++; // A real intervention is metadata, never a synthetic score sample.
      }
    },
  };
}
const globals = globalThis as typeof globalThis & {
  __jevMonitor?: ReturnType<typeof createMonitorStore>;
};
export const monitorStore = (globals.__jevMonitor ??= createMonitorStore());
