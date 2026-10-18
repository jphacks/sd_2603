import { RecallCliError, localRecallIo, sendBot, listMeetingBots } from "@/scripts/recall.mjs";
import { normalizeGoogleMeetUrl } from "@/lib/recall/meeting-url";
import { meetingOwner } from "@/lib/recall/browser-session";
import { invalidateOwnedMeetings } from "@/lib/recall/owned-meetings";
import { monitorStore } from "@/lib/monitor/store";
import { controlAccessError } from "@/lib/recall/controller";

export async function POST(request: Request) {
  const denied = controlAccessError(request, process.env.RECALL_CONTROL_TOKEN);
  if (denied) return denied;
  let meetingUrl = "";
  let agenda = "";
  try {
    const payload: unknown = await request.json();
    if (payload && typeof payload === "object" && "meetingUrl" in payload) {
      meetingUrl = String(payload.meetingUrl ?? "");
      if ("agenda" in payload) agenda = String(payload.agenda ?? "");
    }
  } catch {
    return Response.json({ error: "会議 URL は https:// で始めてください。" }, { status: 400 });
  }

  const normalizedMeetingUrl = normalizeGoogleMeetUrl(meetingUrl);
  if (!normalizedMeetingUrl) return Response.json({ error: "Google Meet のURLを確認してください。" }, { status: 400 });

  try {
    const owner = await meetingOwner(true);
    if (!owner) return Response.json({ error: "利用者セッションを作成できませんでした。" }, { status: 503 });
    const current = (await listMeetingBots(localRecallIo(), owner))[0];
    if (current) return Response.json({ error: "すでに会議へ参加中です。先に退出してください。" }, { status: 409 });
    const sent = await sendBot(normalizedMeetingUrl, localRecallIo(process.env, globalThis.fetch, { persistState: process.env.VERCEL !== "1" }), agenda, { multiple: true, owner });
    invalidateOwnedMeetings(owner);
    monitorStore.activate(sent.id, normalizedMeetingUrl);
    return Response.json(sent);
  } catch (error) {
    if (error instanceof RecallCliError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const status =
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 502;
    const message = error instanceof Error ? error.message : "入室に失敗しました";
    return Response.json({ error: message }, { status });
  }
}
