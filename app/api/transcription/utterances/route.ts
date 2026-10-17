import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { judge } from "@/lib/judge";
import { meetingFeed } from "@/lib/recall/feed.mjs";
import { transcriptStore } from "@/lib/recall/transcript.mjs";

const Input = z.object({ botId: z.string().min(1).max(128), text: z.string().trim().min(1).max(10000), start: z.number().finite().min(0) });

export async function POST(request: Request) {
  const expected = process.env.RECALL_AUDIO_TOKEN ?? "";
  const actual = request.headers.get("authorization") ?? "";
  const wanted = `Bearer ${expected}`;
  if (process.env.ENABLE_REALTIME_TRANSCRIPTION !== "true" || expected.length < 32 || Buffer.byteLength(actual) !== Buffer.byteLength(wanted) || !timingSafeEqual(Buffer.from(actual), Buffer.from(wanted))) {
    return Response.json({ error: "認証が必要です" }, { status: 403 });
  }
  try {
    const input = Input.parse(await request.json());
    const store = transcriptStore();
    const line = { ...input, speaker: "会議音声" };
    const stored = store.add(line);
    if (stored) await meetingFeed(judge).afterLine(line);
    return Response.json({ ok: true, stored });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "入力が正しくありません" }, { status: 400 });
    return Response.json({ error: "文字起こしの判定に失敗しました" }, { status: 502 });
  }
}
