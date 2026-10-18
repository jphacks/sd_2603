import { judge } from "../judge";
import type { JudgeInput, JudgeProvider } from "../judge/types";
import { monitorStore } from "./store";

export async function monitoredJudge(sessionId: string, input: JudgeInput, validate?: () => void, provider: JudgeProvider = judge) {
  validate?.();
  const last = monitorStore.read(sessionId).snapshot?.lastIntervenedAt;
  const effective =
    last == null
      ? input
      : {
          ...input,
          secondsSinceLastIntervention: Math.max(0, (Date.now() - last) / 1000),
        };
  const result = await provider(effective);
  validate?.(); // A superseded result must not become the monitor's latest recommendation.
  monitorStore.record(sessionId, effective, result);
  return result;
}
