import { z } from "zod";
import { deviceStore } from "@/lib/device/state";
import { monitorStore } from "@/lib/monitor/store";
import { authorizedControl } from "@/lib/recall/controller";

const MAX_REQUEST_BYTES = 1_000;
const EventSchema = z.object({
  type: z.enum(["back", "tangent_ok", "unmute"]),
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!authorizedControl(request, process.env.DEVICE_TOKEN))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  const body = await request.text();
  if (body.length > MAX_REQUEST_BYTES)
    return Response.json({ error: "Request too large" }, { status: 413 });
  let event: z.infer<typeof EventSchema>;
  try {
    event = EventSchema.parse(JSON.parse(body));
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const seq = monitorStore.read(sessionId).snapshot?.sequence ?? 0;
  if (event.type === "back") {
    // Takes effect on the session's next judge call, even during the cooldown.
    deviceStore.requestManual(sessionId);
    return Response.json({ accepted: true, pending: true, seq });
  }
  if (event.type === "tangent_ok") deviceStore.mute(sessionId);
  else deviceStore.unmute(sessionId);
  return Response.json({ accepted: true, seq });
}
