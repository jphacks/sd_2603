import { z } from "zod";
import { judge } from "@/lib/judge";

const InputSchema = z.object({
  agenda: z.string().min(1),
  transcript: z.array(z.string()),
  secondsSinceLastIntervention: z.number().min(0),
});

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const result = await judge(input);

    return Response.json(result);
  } catch (error) {
    console.error("Judge API error:", error);

    return Response.json(
      { error: "判定処理に失敗しました" },
      { status: 500 }
    );
  }
}