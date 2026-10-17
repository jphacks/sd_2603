import { judge } from "@/lib/judge";
import { meetingFeed } from "@/lib/recall/feed.mjs";
import { ingestTranscript, transcriptStore } from "@/lib/recall/transcript.mjs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  try {
    const result = ingestTranscript(transcriptStore(), {
      secret: process.env.RECALL_VERIFICATION_SECRET ?? "",
      headers,
      rawBody,
    });
    if (result.stored && result.line) {
      try {
        await meetingFeed(judge).afterLine(result.line);
      } catch (error) {
        console.error("Judge feed error:", error);
      }
    }
    return Response.json({ ok: true, stored: result.stored });
  } catch (error) {
    const status =
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 400;
    const message =
      error instanceof Error ? error.message : "Webhook を受け取れませんでした";
    return Response.json({ error: message }, { status });
  }
}
