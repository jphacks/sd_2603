import { getAgenda } from "@/lib/agenda/agenda";
import { buildDevicePayload } from "@/lib/device/payload";
import { deviceStore } from "@/lib/device/state";
import { monitorStore } from "@/lib/monitor/store";
import { authorizedControl } from "@/lib/recall/controller";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!authorizedControl(request, process.env.DEVICE_TOKEN))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  return Response.json(
    buildDevicePayload(
      monitorStore.read(sessionId),
      deviceStore.read(sessionId),
      getAgenda(sessionId),
      Date.now(),
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
