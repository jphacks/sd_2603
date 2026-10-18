import { timingSafeEqual } from "node:crypto";
import type { JudgeInput, JudgeResult } from "../judge/types";
import { SILENCE_REASON, STALLED_REASON } from "../judge/silence.ts";
import type { VideoView } from "./video";
import type { StallCause } from "../device/state.ts";

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
  guard?: () => Promise<void>;
  onIntervened?: (botId: string, kind: Exclude<VideoView["kind"], "idle">, cause?: StallCause) => void;
  /** Server-side escalation: whether this card should be the firmer, angry one. */
  angry?: (botId: string, kind: Exclude<VideoView["kind"], "idle">, cause?: StallCause) => boolean;
};

export async function applyVideoDecision(
  input: JudgeInput & { botId: string },
  dependencies: Dependencies,
) {
  const result = await dependencies.judge(input);
  return displayVideoResult({ botId: input.botId, agenda: input.agenda, result }, dependencies);
}

export async function displayVideoResult(
  input: { botId: string; agenda: string; result: JudgeResult },
  dependencies: Pick<Dependencies, "render" | "output" | "guard" | "onIntervened" | "angry">,
) {
  const { result } = input;
  if (result.action !== "INTERVENE") {
    return { ...result, video: "unchanged" as const };
  }
  const base: VideoView = result.reason === SILENCE_REASON
    ? { kind: "stalled", cause: "silence" }
    : result.reason === STALLED_REASON
      ? { kind: "stalled" }
      : { kind: "off_agenda", agenda: input.agenda };
  const angry = dependencies.angry?.(input.botId, base.kind, base.kind === "stalled" ? base.cause : undefined) === true;
  const view: VideoView = angry ? { ...base, angry } : base;
  const jpeg = await dependencies.render(view);
  await dependencies.guard?.();
  await dependencies.output(input.botId, jpeg);
  dependencies.onIntervened?.(input.botId, view.kind, view.kind === "stalled" ? view.cause : undefined);
  return { ...result, video: view.kind, ...(angry ? { angry } : {}) };
}

export async function restoreIdleVideo(
  botId: string,
  dependencies: Pick<Dependencies, "render" | "output">,
) {
  await dependencies.output(botId, await dependencies.render({ kind: "idle" }));
  return { video: "idle" as const };
}
