import { monitorStore } from "@/lib/monitor/store";
export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  return Response.json(monitorStore.read(sessionId), {
    headers: { "Cache-Control": "no-store" },
  });
}
