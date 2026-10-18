import { meetingOwner } from "@/lib/recall/browser-session";
import { ownedMeetings } from "@/lib/recall/owned-meetings";
import { monitorStore } from "@/lib/monitor/store";
export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId))
    return Response.json({ error: "Invalid session" }, { status: 400 });
  if (process.env.BROWSER_CONTROL_ENABLED === "true") {
    const owner = await meetingOwner();
    if (!owner || !(await ownedMeetings(owner)).some(meeting => meeting.id === sessionId)) return Response.json({ error: "この会議を表示する権限がありません。" }, { status: 403 });
  }
  return Response.json({ sessionId, ...monitorStore.read(sessionId) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
