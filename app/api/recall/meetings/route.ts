import { listMeetingBots, localRecallIo } from "@/scripts/recall.mjs";
import { controlAccessError } from "@/lib/recall/controller";

export async function POST(request: Request) {
  const denied = controlAccessError(request, process.env.RECALL_CONTROL_TOKEN);
  if (denied) return denied;
  try {
    return Response.json({ meetings: await listMeetingBots(localRecallIo()) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "参加中の会議を取得できませんでした。" }, { status: 502 });
  }
}
