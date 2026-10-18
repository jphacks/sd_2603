import { z } from "zod";
import { deviceStore } from "@/lib/device/state";
import { monitorStore } from "@/lib/monitor/store";
import { authorizedControl } from "@/lib/recall/controller";

// Development only: injects a fake judge result and/or intervention so the
// device screen, gauges and cue can be checked without a live meeting.
const DebugSchema = z.object({
  action: z.enum(["SILENCE", "WAIT", "INTERVENE"]),
  scores: z
    .object({
      drifted: z.number().min(0).max(1),
      stalled: z.number().min(0).max(1),
      tangentIsRelevant: z.number().min(0).max(1),
    })
    .optional(),
  cue: z.enum(["off_agenda", "stalled"]).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (process.env.NODE_ENV !== "development")
    return Response.json({ error: "Not found" }, { status: 404 });
  if (!authorizedControl(request, process.env.DEVICE_TOKEN))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  const parsed = DebugSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { action, scores, cue } = parsed.data;
  monitorStore.record(
    sessionId,
    { agenda: "debug", transcript: ["debug"], secondsSinceLastIntervention: 999 },
    {
      action,
      reason: "Conversation needs more observation",
      message: null,
      diagnostic: scores && { ...scores, model: "debug", latencyMs: 0, questionVersion: "debug" },
    },
  );
  if (cue) {
    monitorStore.intervened(sessionId);
    deviceStore.intervened(sessionId, cue);
  }
  return Response.json({ ok: true });
}
