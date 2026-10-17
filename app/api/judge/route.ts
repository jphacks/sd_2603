import { z } from "zod";
import { monitoredJudge } from "@/lib/monitor/judge";
import { JevError } from "@/lib/judge/jev";

const InputSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  agenda: z.string().trim().min(1).max(500),
  transcript: z.array(z.string().trim().min(1).max(1000)).max(30),
  secondsSinceLastIntervention: z.number().finite().min(0),
});

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const result = await monitoredJudge(input.sessionId ?? "judge", input);

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "入力が正しくありません" }, { status: 400 });
    }
    if (error instanceof JevError) {
      const status = error.kind === "rate_limit" ? 429 : error.kind === "timeout" ? 504 : 502;
      console.error("Judge API error:", error.kind);
      return Response.json({ error: "判定処理に失敗しました", kind: error.kind }, { status });
    }
    console.error("Judge API error:", error);

    return Response.json(
      { error: "判定処理に失敗しました" },
      { status: 500 }
    );
  }
}
