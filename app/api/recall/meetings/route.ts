import { meetingOwner } from "@/lib/recall/browser-session";
import { ownedMeetings } from "@/lib/recall/owned-meetings";
import { controlAccessError } from "@/lib/recall/controller";

export async function POST(request: Request) {
  const denied = controlAccessError(request, process.env.RECALL_CONTROL_TOKEN);
  if (denied) return denied;
  try {
    const owner = await meetingOwner(true);
    if (!owner) return Response.json({ error: "利用者セッションを作成できませんでした。" }, { status: 503 });
    return Response.json({ meetings: await ownedMeetings(owner, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "参加中の会議を取得できませんでした。" }, { status: 502 });
  }
}
