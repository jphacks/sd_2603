import { connection } from "next/server";
import { parseMeetingSelection } from "@/lib/monitor/meeting";
import { resolveMeetingSession } from "@/lib/monitor/resolve-meeting";
import { monitorStore } from "@/lib/monitor/store";

export async function GET(request: Request) {
  await connection();
  const meeting = new URL(request.url).searchParams.get("meeting");
  if (meeting !== null && parseMeetingSelection(meeting)?.kind !== "meeting")
    return Response.json({ error: "会議URLまたはMeetコードを入力してください。" }, { status: 400 });
  const sessionId = meeting !== null
    ? await resolveMeetingSession(meeting)
    : monitorStore.activeSession();
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
