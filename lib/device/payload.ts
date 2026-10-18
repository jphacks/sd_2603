import type { Envelope } from "../monitor/schema.ts";
import type { CueId, InterventionKind } from "./state.ts";

// How long the intervention view stays on the device before it returns to idle.
const VIEW_HOLD_MS = 30_000;
const AGENDA_SHORT_CHARS = 12;

type DeviceStateView = {
  lastKind: InterventionKind | null;
  lastAt: number | null;
  cue: { id: CueId; seq: number } | null;
  mutedUntil: number | null;
};

const TITLES = {
  idle: "見守っています",
  off_agenda: "議題に戻りませんか？",
  stalled: "意見を整理しませんか？",
} as const;

// The same faces as the Meet camera card (lib/recall/video.ts).
const FACES = {
  idle: "watching",
  off_agenda: "redirect",
  stalled: "nudge",
} as const;

export function shortAgenda(agenda: string | null) {
  if (!agenda) return null;
  const first = agenda.split("\n")[0].replace(/^目的:\s*/, "").trim();
  const characters = Array.from(first);
  if (characters.length === 0) return null;
  return characters.length > AGENDA_SHORT_CHARS
    ? `${characters.slice(0, AGENDA_SHORT_CHARS - 1).join("")}…`
    : first;
}

// An INTERVENE decision stays in the snapshot until the next judgement, but the
// device should stop showing red once the intervention view has expired.
function stateFor(decision: "SILENCE" | "WAIT" | "INTERVENE" | null, view: "idle" | InterventionKind) {
  if (!decision) return "unknown" as const;
  if (decision === "INTERVENE") return view === "idle" ? ("wait" as const) : ("intervene" as const);
  return decision === "WAIT" ? ("wait" as const) : ("silence" as const);
}

const percent = (value: number) => Math.round(value * 100);

export function buildDevicePayload(
  envelope: Envelope,
  device: DeviceStateView,
  agenda: string | null,
  now: number,
) {
  const snapshot = envelope.snapshot;
  const view = device.lastKind && device.lastAt !== null && now - device.lastAt < VIEW_HOLD_MS
    ? device.lastKind
    : ("idle" as const);
  const cooldownSec = snapshot?.cooldownUntil
    ? Math.max(0, Math.ceil((snapshot.cooldownUntil - now) / 1000))
    : 0;
  return {
    v: 1 as const,
    seq: snapshot?.sequence ?? 0,
    state: stateFor(snapshot?.decision ?? null, view),
    view,
    face: FACES[view],
    title: TITLES[view],
    agendaShort: shortAgenda(agenda),
    // Missing scores stay null; never show them as 0.
    scores: snapshot?.scores
      ? {
          drift: percent(snapshot.scores.drifted),
          stall: percent(snapshot.scores.stalled),
          tangent: percent(snapshot.scores.tangentIsRelevant),
        }
      : null,
    cooldownSec,
    muted: device.mutedUntil !== null && device.mutedUntil > now,
    cue: device.cue,
  };
}
