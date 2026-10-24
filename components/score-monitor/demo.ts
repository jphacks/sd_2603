import type { MonitorResponse } from "../../lib/monitor/schema";

// /monitor?demo=1 で、実データなしに見た目と動きを確認するための疑似データ（開発時のみ）。
const scenes = [
  [0.08, 0.12, 0.3, "SILENCE", "ON_TOPIC", "議題に沿って順調に進んでいます。"],
  [0.12, 0.22, 0.35, "SILENCE", "ON_TOPIC", "議題に沿って順調に進んでいます。"],
  [0.18, 0.45, 0.3, "WAIT", "OBSERVE", "議論の勢いが落ちています。もう少し様子を見ます。"],
  [0.15, 0.68, 0.28, "INTERVENE", "STALLED", "同じ意見が続いています。一度、ここまでの意見を整理してみませんか？"],
  [0.14, 0.4, 0.3, "SILENCE", "COOLDOWN", "介入したばかりなので、しばらく見守ります。"],
  [0.35, 0.3, 0.55, "WAIT", "OBSERVE", "議題から少し離れました。有用な寄り道か見ています。"],
  [0.74, 0.25, 0.22, "INTERVENE", "DRIFTED_IRRELEVANT", "議題と関係のない話が続いています。そろそろ議題に戻りませんか？"],
  [0.3, 0.2, 0.3, "SILENCE", "COOLDOWN", "介入したばかりなので、しばらく見守ります。"],
] as const;

export const DEMO_INTERVAL_MS = 2000;

export function demoResponse(step: number, now: number): MonitorResponse {
  const [drifted, stalled, tangentIsRelevant, decision, reasonCode, reason] =
    scenes[step % scenes.length];
  const sequence = step + 1;
  return {
    sessionId: "demo",
    expectedIntervalMs: DEMO_INTERVAL_MS,
    history: [],
    snapshot: {
      schemaVersion: 1,
      sessionId: "demo",
      sequence,
      evaluatedAt: now,
      scores: { drifted, stalled, tangentIsRelevant },
      scoresAt: now,
      scoreSequence: sequence,
      decision,
      reason,
      reasonCode,
      transcriptCount: 10 + step,
      lastIntervenedAt: null,
      cooldownUntil: reasonCode === "COOLDOWN" ? now + 20000 : null,
    },
  };
}
