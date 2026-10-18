import { timingSafeEqual } from "node:crypto";
import type { JudgeInput, JudgeResult } from "../judge/types";
import type { VideoView } from "./video";

function normalizedControlSecret(secret: string | undefined) {
  const value = secret?.trim();
  return value && value.length >= 32 && !/\s/.test(value) ? value : null;
}

export function authorizedControl(request: Request, secret: string | undefined) {
  const configured = normalizedControlSecret(secret);
  if (!configured) return false;
  const token = request.headers.get("authorization")?.trim().match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function controlAccessError(request: Request, secret: string | undefined): Response | null {
  const headers = { "Cache-Control": "no-store" };
  if (!normalizedControlSecret(secret)) {
    return Response.json({
      code: "CONTROL_NOT_CONFIGURED",
      error: "操作トークンのサーバー設定が不足しています。管理者はRECALL_CONTROL_TOKENを32文字以上で設定し、再デプロイしてください。",
    }, { status: 503, headers });
  }
  if (!request.headers.get("authorization")?.trim().match(/^Bearer\s+\S+/i)) {
    return Response.json({ code: "CONTROL_TOKEN_REQUIRED", error: "操作トークンを入力してください。会議URLとは別に必要です。" }, { status: 401, headers });
  }
  if (!authorizedControl(request, secret)) {
    return Response.json({ code: "CONTROL_TOKEN_INVALID", error: "操作トークンが一致しません。VercelのRECALL_CONTROL_TOKENと同じ値を入力してください。Meet IDやJevのAPIキーとは別の値です。" }, { status: 401, headers });
  }
  return null;
}

type Dependencies = {
  judge: (input: JudgeInput) => Promise<JudgeResult>;
  render: (view: VideoView) => Promise<Buffer>;
  output: (botId: string, jpeg: Buffer, view: VideoView) => Promise<void>;
  guard?: () => Promise<void>;
  onIntervened?: (botId: string, kind: Exclude<VideoView["kind"], "idle">) => void;
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
  dependencies: Pick<Dependencies, "render" | "output" | "guard" | "onIntervened">,
) {
  const { result } = input;
  if (result.action !== "INTERVENE") {
    return { ...result, video: "unchanged" as const };
  }
  const view: VideoView = result.reason === "Discussion appears stalled"
    ? { kind: "stalled" }
    : { kind: "off_agenda", agenda: input.agenda };
  const jpeg = await dependencies.render(view);
  await dependencies.guard?.();
  await dependencies.output(input.botId, jpeg, view);
  dependencies.onIntervened?.(input.botId, view.kind);
  return { ...result, video: view.kind };
}

export async function restoreIdleVideo(
  botId: string,
  dependencies: Pick<Dependencies, "render" | "output">,
) {
  await dependencies.output(botId, await dependencies.render({ kind: "idle" }), { kind: "idle" });
  return { video: "idle" as const };
}
