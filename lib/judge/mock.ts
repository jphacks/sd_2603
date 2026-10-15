import type {
  JudgeProvider,
} from "./types";

export const mockJudge: JudgeProvider = async (
  input
) => {
  if (input.secondsSinceLastIntervention < 60) {
    return {
      action: "SILENCE",
      reason: "Cooldown active",
      message: null,
    };
  }

  if (input.transcript.length < 3) {
    return {
      action: "WAIT",
      reason: "Not enough conversation",
      message: null,
    };
  }

  return {
    action: "INTERVENE",
    reason: "Mock intervention",
    message: "そろそろ議題に戻りませんか？",
  };
};