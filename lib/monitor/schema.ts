import { z } from "zod";

export const ScoreSchema = z.object({
  drifted: z.number().finite().min(0).max(1),
  stalled: z.number().finite().min(0).max(1),
  tangentIsRelevant: z.number().finite().min(0).max(1),
});
export const PointSchema = z.object({
  sequence: z.number().int().positive(),
  at: z.number().finite().nonnegative(),
  scores: ScoreSchema,
});
export const SnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  streamId: z.string().uuid().optional(),
  sequence: z.number().int().positive(),
  evaluatedAt: z.number().finite().nonnegative(),
  scores: ScoreSchema.nullable(),
  scoresAt: z.number().finite().nonnegative().nullable(),
  scoreSequence: z.number().int().nonnegative(),
  decision: z.enum(["SILENCE", "WAIT", "INTERVENE"]),
  reason: z.string().max(500),
  reasonCode: z.enum([
    "COOLDOWN",
    "INSUFFICIENT_CONTEXT",
    "STALLED",
    "DRIFTED_IRRELEVANT",
    "OBSERVE",
    "ON_TOPIC",
    "OTHER",
  ]),
  transcriptCount: z.number().int().nonnegative(),
  lastIntervenedAt: z.number().finite().nonnegative().nullable(),
  cooldownUntil: z.number().finite().nonnegative().nullable(),
});
export const EnvelopeSchema = z.object({
  snapshot: SnapshotSchema.nullable(),
  history: z.array(PointSchema).max(240),
  expectedIntervalMs: z.number().finite().positive().nullable(),
});
export type Scores = z.infer<typeof ScoreSchema>;
export type Point = z.infer<typeof PointSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;
export const SCORE_KEYS = ["drifted", "stalled", "tangentIsRelevant"] as const;
export const SCORE_META = {
  drifted: { label: "脱線", color: "#f29689" },
  stalled: { label: "停滞", color: "#e8bc69" },
  tangentIsRelevant: { label: "寄り道の有用性", color: "#83d5b9" },
};

export function acceptEnvelope(
  previous: Envelope | null,
  incoming: unknown,
  sessionId: string,
): Envelope | null {
  const parsed = EnvelopeSchema.safeParse(incoming);
  if (
    !parsed.success ||
    (parsed.data.snapshot && parsed.data.snapshot.sessionId !== sessionId)
  )
    return previous;
  const next = parsed.data;
  if (
    previous?.snapshot?.sessionId === sessionId &&
    (!next.snapshot ||
      (next.snapshot.streamId === previous.snapshot.streamId &&
        next.snapshot.sequence <= previous.snapshot.sequence) ||
      next.snapshot.evaluatedAt < previous.snapshot.evaluatedAt)
  )
    return previous;
  return next;
}

export function remainingCooldown(snapshot: Snapshot | null, now: number) {
  return snapshot?.cooldownUntil
    ? Math.max(0, Math.ceil((snapshot.cooldownUntil - now) / 1000))
    : 0;
}

// Sampling is event-driven. Learn cadence from measured responses, never assume a 5s cadence.
export function expectedInterval(history: Point[]): number | null {
  const intervals = history
    .slice(-10)
    .slice(1)
    .map((point, index) => point.at - history.slice(-10)[index].at)
    .filter((value) => value > 0);
  if (intervals.length < 2) return null;
  return [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
}
