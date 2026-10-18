import { connection } from "next/server";
import { monitorStore } from "@/lib/monitor/store";

export async function GET() {
  await connection();
  const sessionId = monitorStore.activeSession();
  return Response.json(
    {
      sessionId,
      ...(sessionId
        ? monitorStore.read(sessionId)
        : { snapshot: null, history: [], expectedIntervalMs: null }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
