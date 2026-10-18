import type { JudgeInput, JudgeResult } from "../judge/types";
import { deviceStore } from "./state.ts";

type Judge = (input: JudgeInput) => Promise<JudgeResult>;

// Applies device button state on top of the judge: a manual request forces an
// intervention, and a muted tangent downgrades one to WAIT. Scores stay real.
export function withDeviceControls(sessionId: string, judge: Judge, store = deviceStore): Judge {
  return async (input) => {
    // Only a consumed device event may grant the worker's manual-display bypass.
    const result = { ...await judge(input), manual: false };
    if (store.takeManual(sessionId)) {
      return {
        ...result,
        action: "INTERVENE",
        manual: true,
        reason: result.reason === "Discussion appears stalled" ? result.reason : "Manual request",
        message: result.message ?? "そろそろ議題に戻りませんか？",
      };
    }
    if (result.action === "INTERVENE" && store.read(sessionId).mutedUntil !== null) {
      return { ...result, action: "WAIT", reason: "Tangent marked useful", message: null };
    }
    return result;
  };
}
