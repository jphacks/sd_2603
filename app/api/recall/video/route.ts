import { z } from "zod";
import { AGENDA_CHAR_LIMIT, AgendaChangedError, assertAgendaSnapshot, getAgendaSnapshot, withAgendaSnapshot } from "@/lib/agenda/agenda";
import { monitoredJudge } from "@/lib/monitor/judge";
import { monitorStore } from "@/lib/monitor/store";
import { withDeviceControls } from "@/lib/device/judge";
import { angryAfter, deviceStore, type InterventionKind, type StallCause } from "@/lib/device/state";
import { resolvesIntervention } from "@/lib/judge/resolution";
import type { JudgeResult } from "@/lib/judge/types";
import { JevError } from "@/lib/judge/jev";
import { silenceJudge } from "@/lib/judge/silence";
import { applyVideoDecision, authorizedControl, displayVideoResult, restoreIdleVideo } from "@/lib/recall/controller";
import { outputVideo, RecallVideoError, renderVideoJpeg } from "@/lib/recall/video";
import { assertDisplayControls, isRecommendationCancelled, recommendationStore } from "@/lib/recall/recommendation";

const MAX_REQUEST_BYTES = 12_000;
const BotIdSchema = z.string().uuid();
const JudgeRequestSchema = z.object({
  mode: z.literal("judge"),
  botId: BotIdSchema,
  agenda: z.string().trim().min(1).max(AGENDA_CHAR_LIMIT),
  transcript: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  secondsSinceLastIntervention: z.number().finite().min(0),
});
const AgendaVersionSchema = z.string().min(1).max(128);
const EvaluateRequestSchema = JudgeRequestSchema.extend({ mode: z.literal("evaluate"), agendaVersion: AgendaVersionSchema });
// The worker reports a silence; the server owns the resulting reason and message.
const SilenceRequestSchema = EvaluateRequestSchema.extend({ mode: z.literal("silence") });
const AgendaRequestSchema = z.object({ mode: z.literal("agenda"), botId: BotIdSchema, agenda: z.string().trim().min(1).max(AGENDA_CHAR_LIMIT) });
const DisplayRequestSchema = z.object({
  mode: z.literal("display"),
  botId: BotIdSchema,
  agenda: z.string().trim().min(1).max(AGENDA_CHAR_LIMIT),
  agendaVersion: AgendaVersionSchema,
  requestId: z.string().uuid(),
  recommendationId: z.string().uuid(),
  generation: z.number().int().min(0),
  result: z.object({
    action: z.enum(["SILENCE", "WAIT", "INTERVENE"]),
    reason: z.string().max(500),
    message: z.string().max(1000).nullable(),
  }),
});
const ResetRequestSchema = z.object({ mode: z.literal("idle"), botId: BotIdSchema });
const InputSchema = z.discriminatedUnion("mode", [JudgeRequestSchema, EvaluateRequestSchema, SilenceRequestSchema, DisplayRequestSchema, ResetRequestSchema, AgendaRequestSchema]);
const videoDependencies = { render: renderVideoJpeg, output: outputVideo };
const displayed = new Set<string>();
const displaying = new Map<string, Promise<unknown>>();
class SpeechResumedError extends Error {}

// Escalation lives on the server: the worker never decides the level or the face.
function angryCard(botId: string, kind: InterventionKind, cause?: StallCause) {
  const threshold = angryAfter();
  return threshold > 0 && deviceStore.nextLevel(botId, kind, cause) >= threshold;
}

// A judgement that shows the meeting back on track resets the escalation, and
// tells the worker it may take down the card it is holding.
function noteResolution(botId: string, result: JudgeResult) {
  const resolved = resolvesIntervention(result);
  if (resolved) deviceStore.resolve(botId);
  return resolved;
}

async function confirmQuiet(botId: string, generation: number) {
  if (process.env.ENABLE_REALTIME_TRANSCRIPTION !== "true") return;
  const port = Number(process.env.RECALL_AUDIO_PORT ?? 8787);
  const token = process.env.RECALL_AUDIO_TOKEN;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !token || token.length < 32) throw new SpeechResumedError();
  const response = await fetch(`http://127.0.0.1:${port}/quiet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ botId, generation }),
    signal: AbortSignal.timeout(1_000),
  });
  if (!response.ok) throw new SpeechResumedError();
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_REQUEST_BYTES) throw new RangeError("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body");
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) throw new RangeError("Request too large");
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
}

export async function POST(request: Request) {
  if (!process.env.RECALL_CONTROL_TOKEN || process.env.RECALL_CONTROL_TOKEN.length < 32) {
    return Response.json({ error: "Recall video control is not configured" }, { status: 503 });
  }
  if (!authorizedControl(request, process.env.RECALL_CONTROL_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = InputSchema.parse(await readBoundedJson(request));
    if (input.mode === "agenda") {
      return Response.json(getAgendaSnapshot(input.botId, input.agenda));
    }
    if (input.mode === "judge") {
      const { agenda, agendaVersion } = getAgendaSnapshot(input.botId, input.agenda);
      const validate = () => assertAgendaSnapshot(input.botId, agenda, agendaVersion);
      const result = await applyVideoDecision({ ...input, agenda }, {
        judge: withDeviceControls(input.botId, (value) => monitoredJudge(input.botId, value, validate)),
        ...videoDependencies,
        guard: async () => validate(),
        angry: angryCard,
        onIntervened: (id, kind, cause) => {
          monitorStore.intervened(id);
          deviceStore.intervened(id, kind, cause);
        },
      });
      return Response.json({ ...result, agenda, resolved: noteResolution(input.botId, result) });
    }
    if (input.mode === "evaluate") {
      // Starting any newer evaluation invalidates its predecessor, even when
      // the new result is WAIT/SILENCE or evaluation fails.
      const recommendationId = recommendationStore.begin(input);
      const judge = withDeviceControls(input.botId, (value) => monitoredJudge(input.botId, value, () => assertAgendaSnapshot(input.botId, input.agenda, input.agendaVersion)));
      const result = await judge(input);
      recommendationStore.complete(input, recommendationId, result);
      return Response.json({ ...result, recommendationId, resolved: noteResolution(input.botId, result) });
    }
    if (input.mode === "silence") {
      // Same recommendation/display guard as "evaluate", without the paid judge.
      // Cooldown and device mute apply; a pending manual request is left alone.
      const recommendationId = recommendationStore.begin(input);
      const judge = withDeviceControls(input.botId, (value) => monitoredJudge(input.botId, value, () => assertAgendaSnapshot(input.botId, input.agenda, input.agendaVersion), silenceJudge), deviceStore, { manual: false });
      const result = await judge(input);
      recommendationStore.complete(input, recommendationId, result);
      return Response.json({ ...result, recommendationId });
    }
    if (input.mode === "display") {
      const key = `${input.botId}:${input.requestId}`;
      if (displayed.has(key)) return Response.json({ video: "unchanged", duplicate: true });
      if (displaying.has(key)) {
        await displaying.get(key);
        return Response.json({ video: "unchanged", duplicate: true });
      }
      // Never trust a caller-supplied manual flag, reason, or model decision.
      const recommendation = recommendationStore.read(input, input.recommendationId);
      const checkControls = () => assertDisplayControls(recommendation, {
        mutedUntil: deviceStore.read(input.botId).mutedUntil,
        lastIntervenedAt: monitorStore.read(input.botId).snapshot?.lastIntervenedAt ?? null,
      });
      checkControls();
      const task = displayVideoResult({ ...input, result: recommendation }, {
        ...videoDependencies,
        guard: () => withAgendaSnapshot(input, async () => {
          await confirmQuiet(input.botId, input.generation);
          recommendationStore.read(input, input.recommendationId);
          checkControls();
        }),
        angry: angryCard,
        onIntervened: (id, kind, cause) => {
          monitorStore.intervened(id);
          deviceStore.intervened(id, kind, cause);
        },
      });
      displaying.set(key, task);
      let result;
      try { result = await task; } finally { displaying.delete(key); }
      displayed.add(key);
      recommendationStore.invalidate(input.botId);
      if (displayed.size > 100) displayed.delete(displayed.values().next().value!);
      return Response.json(result);
    }
    const restored = await restoreIdleVideo(input.botId, videoDependencies);
    deviceStore.cleared(input.botId);
    return Response.json(restored);
  } catch (error) {
    if (isRecommendationCancelled(error)) {
      return Response.json({ error: "Recommendation expired, superseded, or suppressed", cancelled: true }, { status: 409 });
    }
    if (error instanceof AgendaChangedError) {
      return Response.json({ error: "Agenda changed or updating; recommendation cancelled", cancelled: true }, { status: 409 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof TypeError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error instanceof RangeError) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    if (error instanceof SpeechResumedError) {
      return Response.json({ error: "Speech resumed; card not displayed" }, { status: 409 });
    }
    if (error instanceof RecallVideoError) {
      const status = error.kind === "config" ? 503 : error.kind === "rate_limit" ? 429 : 502;
      console.error("Recall video output failed", { kind: error.kind, diagnostic: error.diagnostic });
      return Response.json({ error: "Recall video output failed", kind: error.kind, diagnostic: error.diagnostic }, { status });
    }
    if (error instanceof JevError) {
      const status = error.kind === "rate_limit" ? 429 : error.kind === "timeout" ? 504 : 502;
      console.error("Judge failed", { kind: error.kind });
      return Response.json({ error: "Judge failed", kind: error.kind }, { status });
    }
    console.error("Recall video control failed:", error);
    return Response.json({ error: "Video control failed" }, { status: 500 });
  }
}
