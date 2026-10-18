import { meetingOwner } from "@/lib/recall/browser-session";
import { ownedMeetings } from "@/lib/recall/owned-meetings";
import { remoteAudioEnabled } from "@/lib/recall/audio-bridge";
import { workerRequest } from "@/scripts/transcription/bridge.mjs";

export async function GET(request: Request) {
  const botId = new URL(request.url).searchParams.get("botId");
  const owner = await meetingOwner();
  if (!owner || !(await ownedMeetings(owner)).some(bot => bot.id === botId)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!remoteAudioEnabled()) return Response.json({ enabled: false, message: "音声の自動判定が設定されていません。" });
  try {
    const result = await workerRequest(process.env, "/status", { botId });
    if (!result.ok) return Response.json({ enabled: true, failed: true, message: "このBotの音声セッションがありません。退出後に再参加してください。" }, { status: result.status });
    return Response.json({ enabled: true, ...await result.json() }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ enabled: true, failed: true, message: "音声処理サーバーに接続できません。" }, { status: 503 }); }
}
