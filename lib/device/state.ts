export type InterventionKind = "off_agenda" | "stalled";
export type CueId = "back_to_agenda" | "summarize";
export type StallCause = "silence" | "repetition";

const MUTE_MS = 120_000;

// From this many interventions without the meeting returning in between, the
// card turns firmer (angry face). 0 disables it.
export function angryAfter(env: Record<string, string | undefined> = process.env) {
  const value = Number(env.ANGRY_AFTER_INTERVENTIONS ?? 2);
  return Number.isInteger(value) && value >= 0 ? value : 2;
}

// A card stays up until the meeting returns, but never longer than this.
export function maxHoldMs(env: Record<string, string | undefined> = process.env) {
  const seconds = Number(env.INTERVENTION_MAX_HOLD_SECONDS ?? 180);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 180_000;
}

const escalates = (kind: InterventionKind, cause?: StallCause) => !(kind === "stalled" && cause === "silence");
const MAX_SESSIONS = 32;
const IDLE_MS = 600_000;

type DeviceState = {
  lastKind: InterventionKind | null;
  lastCause: StallCause | null;
  lastAt: number | null;
  /** The card is on the camera until the worker restores the idle face. */
  showing: boolean;
  /** Level of the card on show: 1 for the first, higher while the meeting has not returned. */
  lastLevel: number;
  /** Interventions since the meeting last returned; silence nudges do not count. */
  level: number;
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
        data: { lastKind: null, lastCause: null, lastAt: null, showing: false, lastLevel: 0, level: 0, cue: null, mutedUntil: null, manualRequested: false },
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
    // The level the next card of this kind would have.
    nextLevel(id: string, kind: InterventionKind, cause?: StallCause) {
      const data = entry(id);
      return escalates(kind, cause) ? data.level + 1 : 1;
    },
    intervened(id: string, kind: InterventionKind, cause?: StallCause) {
      const data = entry(id);
      if (escalates(kind, cause)) data.level++;
      data.lastLevel = escalates(kind, cause) ? data.level : 1;
      data.showing = true;
      data.lastKind = kind;
      data.lastCause = kind === "stalled" ? (cause ?? "repetition") : null;
      data.lastAt = now();
      data.cue = { id: kind === "stalled" ? "summarize" : "back_to_agenda", seq: (data.cue?.seq ?? 0) + 1 };
      data.manualRequested = false;
    },
    // A judgement showed the meeting back on track: the next card starts over.
    resolve(id: string) {
      entry(id).level = 0;
    },
    // The worker put the idle face back on the camera.
    cleared(id: string) {
      entry(id).showing = false;
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
