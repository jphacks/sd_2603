import { timingSafeEqual } from "node:crypto";
import type { JudgeInput, JudgeResult } from "../judge/types";
import type { VideoView } from "./video";

export function authorizedControl(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const token = request.headers.get("authorization")?.match(/^Bearer ([^ ]+)$/)?.[1];
  if (!token) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type Dependencies = {
  judge: (input: JudgeInput) => Promise<JudgeResult>;
  render: (view: VideoView) => Promise<Buffer>;
  output: (botId: string, jpeg: Buffer) => Promise<void>;
  onIntervened?: (botId: string, kind: Exclude<VideoView["kind"], "idle">) => void;
};

export async function applyVideoDecision(
  input: JudgeInput & { botId: string },
  dependencies: Dependencies,
) {
  const result = await dependencies.judge(input);
  if (result.action !== "INTERVENE") {
    return { ...result, video: "unchanged" as const };
  }
  const view: VideoView = result.reason === "Discussion appears stalled"
    ? { kind: "stalled" }
    : { kind: "off_agenda", agenda: input.agenda };
  await dependencies.output(input.botId, await dependencies.render(view));
  dependencies.onIntervened?.(input.botId, view.kind);
  return { ...result, video: view.kind };
}

export async function restoreIdleVideo(
  botId: string,
  dependencies: Pick<Dependencies, "render" | "output">,
) {
  await dependencies.output(botId, await dependencies.render({ kind: "idle" }));
  return { video: "idle" as const };
}
