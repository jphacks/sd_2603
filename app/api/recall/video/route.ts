import { z } from "zod";
import { AGENDA_CHAR_LIMIT, agendaForJudge } from "@/lib/agenda/agenda";
import { monitoredJudge } from "@/lib/monitor/judge";
import { monitorStore } from "@/lib/monitor/store";
import { JevError } from "@/lib/judge/jev";
import { applyVideoDecision, authorizedControl, restoreIdleVideo } from "@/lib/recall/controller";
import { outputVideo, RecallVideoError, renderVideoJpeg } from "@/lib/recall/video";

const MAX_REQUEST_BYTES = 12_000;
const BotIdSchema = z.string().uuid();
const JudgeRequestSchema = z.object({
  mode: z.literal("judge"),
  botId: BotIdSchema,
  agenda: z.string().trim().min(1).max(AGENDA_CHAR_LIMIT),
  transcript: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  secondsSinceLastIntervention: z.number().finite().min(0),
});
const ResetRequestSchema = z.object({ mode: z.literal("idle"), botId: BotIdSchema });
const InputSchema = z.discriminatedUnion("mode", [JudgeRequestSchema, ResetRequestSchema]);
const videoDependencies = { render: renderVideoJpeg, output: outputVideo };

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
    if (input.mode === "judge") {
      const agenda = agendaForJudge(input.botId, input.agenda);
      const result = await applyVideoDecision({ ...input, agenda }, {
        judge: (value) => monitoredJudge(input.botId, value),
        ...videoDependencies,
        onIntervened: (id) => monitorStore.intervened(id),
      });
      return Response.json({ ...result, agenda });
    }
    return Response.json(await restoreIdleVideo(input.botId, videoDependencies));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof TypeError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error instanceof RangeError) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    if (error instanceof RecallVideoError) {
      const status = error.kind === "config" ? 503 : error.kind === "rate_limit" ? 429 : 502;
      return Response.json({ error: "Recall video output failed", kind: error.kind }, { status });
    }
    if (error instanceof JevError) {
      const status = error.kind === "rate_limit" ? 429 : error.kind === "timeout" ? 504 : 502;
      return Response.json({ error: "Judge failed", kind: error.kind }, { status });
    }
    console.error("Recall video control failed:", error);
    return Response.json({ error: "Video control failed" }, { status: 500 });
  }
}
