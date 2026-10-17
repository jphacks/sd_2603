import { z } from "zod";

const mediaSchema = z.object({
  video_mixed: z.object({
    data: z.object({ download_url: z.string().url() }).nullish(),
  }).nullish(),
}).nullish();

export const botVideoSchema = z.object({
  media_shortcuts: mediaSchema,
  recordings: z.array(z.object({ media_shortcuts: mediaSchema })).optional(),
});

export function extractVideoUrl(data: unknown): string | null {
  const bot = botVideoSchema.parse(data);
  const url = bot.media_shortcuts?.video_mixed?.data?.download_url
    ?? [...(bot.recordings ?? [])].reverse().find(recording => recording.media_shortcuts?.video_mixed?.data?.download_url)?.media_shortcuts?.video_mixed?.data?.download_url;
  if (!url) return null;
  if (new URL(url).protocol !== "https:") throw new Error("Unsupported video URL");
  return url;
}
