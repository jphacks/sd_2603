import type { JudgeResult } from "./types";
import { INTERVENTION_THRESHOLD, UNCERTAIN_THRESHOLD } from "./jev.ts";

export const TANGENT_OK_REASON = "Tangent marked useful";

// True when a judgement shows the meeting no longer needs the card that is up:
// not off the agenda (or on a useful tangent) and not stalled. An uncertain
// judgement keeps the card. A participant marking the tangent useful also counts.
export function resolvesIntervention(result: JudgeResult) {
  if (result.reason === TANGENT_OK_REASON) return true;
  const scores = result.diagnostic;
  if (!scores) return false;
  const offAgenda = scores.drifted >= UNCERTAIN_THRESHOLD && scores.tangentIsRelevant < INTERVENTION_THRESHOLD;
  return !offAgenda && scores.stalled < UNCERTAIN_THRESHOLD;
}
