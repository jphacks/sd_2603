import type { JudgeInput, JudgeResult } from "../judge/types";
import { isStalledReason } from "../judge/silence.ts";
import { TANGENT_OK_REASON } from "../judge/resolution.ts";
import { deviceStore } from "./state.ts";

type Judge = (input: JudgeInput) => Promise<JudgeResult>;

// Applies device button state on top of the judge: a manual request forces an
// intervention, and a muted tangent downgrades one to WAIT. Scores stay real.
// `manual: false` leaves a pending device request for the next real judgement.
export function withDeviceControls(sessionId: string, judge: Judge, store = deviceStore, { manual = true } = {}): Judge {
  return async (input) => {
    // Only a consumed device event may grant the worker's manual-display bypass.
    const result = { ...await judge(input), manual: false };
    if (manual && store.takeManual(sessionId)) {
      return {
        ...result,
        action: "INTERVENE",
        manual: true,
        reason: isStalledReason(result.reason) ? result.reason : "Manual request",
        message: result.message ?? "そろそろ議題に戻りませんか？",
      };
    }
    if (result.action === "INTERVENE" && store.read(sessionId).mutedUntil !== null) {
      return { ...result, action: "WAIT", reason: TANGENT_OK_REASON, message: null };
    }
    return result;
  };
}
