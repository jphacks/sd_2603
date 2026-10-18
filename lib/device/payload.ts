import type { Envelope } from "../monitor/schema.ts";
import { angryAfter, maxHoldMs, type CueId, type InterventionKind, type StallCause } from "./state.ts";

const AGENDA_SHORT_CHARS = 12;

type DeviceStateView = {
  lastKind: InterventionKind | null;
  lastCause?: StallCause | null;
  lastAt: number | null;
  showing?: boolean;
  lastLevel?: number;
  cue: { id: CueId; seq: number } | null;
  mutedUntil: number | null;
};

const TITLES = {
  idle: "見守っています",
  off_agenda: "議題に戻りませんか？",
  stalled: "意見を整理しませんか？",
} as const;
// Silence asks for a voice instead of a summary; same nudge face.
const SILENCE_TITLE = "何か気になる点は？";
// Firmer lines once interventions pile up without the meeting returning.
const ANGRY_TITLES = {
  off_agenda: "議題に戻りましょう",
  stalled: "一度整理しましょう",
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
  // The card stays while the camera shows it (until the meeting returns), with
  // the same upper limit as the worker in case it never restores the idle face.
  const view = device.showing && device.lastKind && device.lastAt !== null && now - device.lastAt < maxHoldMs()
    ? device.lastKind
    : ("idle" as const);
  const silence = view === "stalled" && device.lastCause === "silence";
  const level = view === "idle" ? 0 : (device.lastLevel ?? 1);
  const threshold = angryAfter();
  const angry = view !== "idle" && !silence && threshold > 0 && level >= threshold;
  const cooldownSec = snapshot?.cooldownUntil
    ? Math.max(0, Math.ceil((snapshot.cooldownUntil - now) / 1000))
    : 0;
  return {
    v: 1 as const,
    seq: snapshot?.sequence ?? 0,
    state: stateFor(snapshot?.decision ?? null, view),
    view,
    level,
    face: angry ? ("angry" as const) : FACES[view],
    title: angry ? ANGRY_TITLES[view] : silence ? SILENCE_TITLE : TITLES[view],
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
