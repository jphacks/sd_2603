import type { JudgeInput, JudgeResult } from "./types";
import { mockJudge } from "./mock";
import { jevJudge } from "./jev";

export async function judge(
  input: JudgeInput
): Promise<JudgeResult> {
  const provider = process.env.AI_PROVIDER ?? "mock";

  if (provider === "mock") {
    return mockJudge(input);
  }

  if (provider === "jev") {
    if (process.env.ALLOW_PAID_AI !== "true") {
      throw new Error(
        "Jev execution blocked: ALLOW_PAID_AI is not true"
      );
    }

    return jevJudge(input);
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}