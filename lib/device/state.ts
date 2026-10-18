export type InterventionKind = "off_agenda" | "stalled";
export type CueId = "back_to_agenda" | "summarize";
export type StallCause = "silence" | "repetition";

const MUTE_MS = 120_000;
const MAX_SESSIONS = 32;
const IDLE_MS = 600_000;

type DeviceState = {
  lastKind: InterventionKind | null;
  lastCause: StallCause | null;
  lastAt: number | null;
  cue: { id: CueId; seq: number } | null;
  mutedUntil: number | null;
  manualRequested: boolean;
};

export function createDeviceStore(now = Date.now) {
  const sessions = new Map<string, { data: DeviceState; touched: number }>();
  function entry(id: string) {
    const time = now();
    for (const [key, value] of sessions)
      if (time - value.touched > IDLE_MS) sessions.delete(key);
    let value = sessions.get(id);
    if (!value) {
      if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
      value = {
        data: { lastKind: null, lastCause: null, lastAt: null, cue: null, mutedUntil: null, manualRequested: false },
        touched: time,
      };
      sessions.set(id, value);
    }
    value.touched = time;
    return value.data;
  }
  return {
    read(id: string): DeviceState {
      const data = entry(id);
      if (data.mutedUntil !== null && data.mutedUntil <= now()) data.mutedUntil = null;
      return structuredClone(data);
    },
    intervened(id: string, kind: InterventionKind, cause?: StallCause) {
      const data = entry(id);
      data.lastKind = kind;
      data.lastCause = kind === "stalled" ? (cause ?? "repetition") : null;
      data.lastAt = now();
      data.cue = { id: kind === "stalled" ? "summarize" : "back_to_agenda", seq: (data.cue?.seq ?? 0) + 1 };
      data.manualRequested = false;
    },
    // "戻して": the next judge call becomes an intervention, even during the cooldown.
    requestManual(id: string) {
      entry(id).manualRequested = true;
    },
    takeManual(id: string) {
      const data = entry(id);
      const requested = data.manualRequested;
      data.manualRequested = false;
      return requested;
    },
    mute(id: string) {
      entry(id).mutedUntil = now() + MUTE_MS;
    },
    unmute(id: string) {
      entry(id).mutedUntil = null;
    },
  };
}

const globals = globalThis as typeof globalThis & {
  __deviceState?: ReturnType<typeof createDeviceStore>;
};
export const deviceStore = (globals.__deviceState ??= createDeviceStore());
