import { z } from "zod";

export const chatEventSchema = z.object({
  event: z.literal("participant_events.chat_message"),
  data: z.object({
    bot: z.object({ id: z.string().uuid() }),
    data: z.object({
      participant: z.object({ id: z.number(), name: z.string().nullish() }),
      timestamp: z.object({ absolute: z.string().datetime({ offset: true }) }),
      data: z.object({ text: z.string().min(1).max(20000), to: z.string() }),
    }),
  }),
});

export type MeetChatMessage = {
  id: string;
  sender: string;
  text: string;
  sentAt: string;
  links: string[];
};

export function chatMessage(event: z.infer<typeof chatEventSchema>, eventId: string): MeetChatMessage {
  const item = event.data.data;
  const candidates = item.data.text.match(/https:\/\/[^\s<>"）)]+/g) ?? [];
  return {
    id: eventId, sender: item.participant.name || "参加者", text: item.data.text,
    sentAt: item.timestamp.absolute,
    links: [...new Set(candidates)].filter(value => { try { return new URL(value).protocol === "https:"; } catch { return false; } }).slice(0, 10),
  };
}

export function agendaText(message: MeetChatMessage) {
  return message.text.replace(/^\s*(?:@Focus\s*)?(?:#agenda|#アジェンダ|アジェンダ[:：])\s*/i, "").trim();
}
