import { receiveChatWebhook } from "@/lib/agenda/receive";
import { verifyRecallWebhook } from "@/lib/recall/webhook";
import { audioBridge, remoteAudioEnabled } from "@/lib/recall/audio-bridge";

export async function POST(request: Request) {
  const payload = await request.text();
  if (Buffer.byteLength(payload) > 64_000) return Response.json({ error: "Request too large" }, { status: 413 });
  if (remoteAudioEnabled()) {
    try { verifyRecallWebhook({ payload, headers: request.headers, secret: process.env.RECALL_WEBHOOK_SECRET ?? "" }); }
    catch { return Response.json({ error: "署名を確認できません" }, { status: 401 }); }
    let event;
    try { event = JSON.parse(payload); } catch { return Response.json({ updated: false }); }
    if (event.event !== "participant_events.chat_message" || typeof event.data?.bot?.id !== "string") return Response.json({ updated: false });
    return audioBridge(event.data.bot.id, "/api/recall/chat", { payload, headers: Object.fromEntries(request.headers) });
  }
  const result = await receiveChatWebhook({
    payload,
    headers: request.headers,
    secret: process.env.RECALL_WEBHOOK_SECRET ?? "",
  });
  return Response.json(result.body, { status: result.status });
}
