import type { JudgeProvider, JudgeResult } from "./types";

export const STALLED_REASON = "Discussion appears stalled";
export const SILENCE_REASON = "Meeting has gone silent";
export const SILENCE_MESSAGE = "ここまでで、気になる点はありますか？";

// Both mean "the meeting is not moving forward" and share the stalled card.
export function isStalledReason(reason: string) {
  return reason === STALLED_REASON || reason === SILENCE_REASON;
}

// The worker decides silence from timing alone; this never calls Jev.
export const silenceJudge: JudgeProvider = async (input): Promise<JudgeResult> => {
  if (input.secondsSinceLastIntervention < 60) {
    return { action: "SILENCE", reason: "Cooldown active", message: null };
  }
  return { action: "INTERVENE", reason: SILENCE_REASON, message: SILENCE_MESSAGE };
};
