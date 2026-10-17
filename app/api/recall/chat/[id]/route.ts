import { verifyRecallWebhook } from "@/lib/recall/verify";
import { chatEventSchema, chatMessage } from "@/lib/recall/chat";
import { receiveMeetChat } from "@/lib/focus/store";
import { apiError, privateJson } from "@/lib/focus/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const secret = process.env.RECALL_WORKSPACE_VERIFICATION_SECRET;
    if (!secret) return privateJson({ error: "Webhook検証用シークレットが未設定です。" }, 503);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 150000) return privateJson({ error: "Payload too large" }, 413);
    if (!verifyRecallWebhook(raw, request.headers, secret)) return privateJson({ error: "Invalid webhook signature" }, 401);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return privateJson({ error: "Invalid JSON" }, 400); }
    if ((parsed as { event?: string })?.event !== "participant_events.chat_message") return privateJson({ ignored: true });
    const event = chatEventSchema.safeParse(parsed);
    if (!event.success) return privateJson({ error: "Invalid chat event" }, 400);
    const { id } = await context.params;
    // Persist only the bounded chat event. File download/AI work never blocks this acknowledgment.
    await receiveMeetChat(id, event.data.data.bot.id, chatMessage(event.data, request.headers.get("webhook-id")!));
    return privateJson({ received: true });
  } catch (error) { return apiError(error); }
}
