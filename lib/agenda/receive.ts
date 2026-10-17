import { z } from "zod";
import { verifyRecallWebhook } from "../recall/webhook.ts";
import { ingestChatMessage } from "./ingest.ts";

const MAX_BODY_BYTES = 64_000;

const ChatEventSchema = z.object({
  event: z.string(),
  data: z.object({
    data: z.object({
      participant: z.object({ name: z.string().nullable().optional() }).optional(),
      data: z.object({ text: z.string().optional() }).optional(),
    }).optional(),
    bot: z.object({ id: z.string().uuid() }).optional(),
  }).optional(),
});

export async function receiveChatWebhook(
  input: { payload: string; headers: Headers | Record<string, string>; secret: string },
  dependencies: Parameters<typeof ingestChatMessage>[1] & { nowSeconds?: number } = {},
): Promise<{ status: number; body: { error: string } | { updated: boolean; reason: string } }> {
  if (Buffer.byteLength(input.payload) > MAX_BODY_BYTES) {
    return { status: 413, body: { error: "Request too large" } };
  }
  try {
    verifyRecallWebhook({
      secret: input.secret,
      headers: input.headers,
      payload: input.payload,
      nowSeconds: dependencies.nowSeconds,
    });
  } catch {
    return { status: 401, body: { error: "署名を確認できません" } };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(input.payload);
  } catch {
    return { status: 200, body: { updated: false, reason: "ignored" } };
  }
  const parsed = ChatEventSchema.safeParse(parsedBody);
  if (!parsed.success || parsed.data.event !== "participant_events.chat_message") {
    return { status: 200, body: { updated: false, reason: "ignored" } };
  }
  const botId = parsed.data.data?.bot?.id;
  const text = parsed.data.data?.data?.data?.text ?? "";
  if (!botId || !text.trim()) return { status: 200, body: { updated: false, reason: "ignored" } };

  const result = await ingestChatMessage({
    botId,
    participantName: parsed.data.data?.data?.participant?.name ?? null,
    text,
  }, dependencies);
  return { status: 200, body: { updated: result.updated, reason: result.reason } };
}
