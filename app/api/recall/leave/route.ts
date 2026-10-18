import { localRecallIo, removeBot } from "@/scripts/recall.mjs";
import { authorizedControl } from "@/lib/recall/controller";

export async function POST(request: Request) {
  if (!authorizedControl(request, process.env.RECALL_CONTROL_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let id = "";
  try {
    const payload: unknown = await request.json();
    if (payload && typeof payload === "object" && "botId" in payload) {
      id = String(payload.botId ?? "").trim();
    }
  } catch {
    id = "";
  }
  if (!/^[0-9a-f-]{20,64}$/i.test(id)) {
    return Response.json({ error: "退出するボットIDを確認できません。" }, { status: 400 });
  }

  try {
    const io = localRecallIo(process.env, globalThis.fetch, { persistState: false });
    const result = await removeBot(io, id);
    if (result.left) {
      return Response.json({
        id: result.id,
        left: true,
        alreadyGone: result.alreadyGone,
        code: result.code,
      });
    }
    const error = result.timeout
      ? "60秒以内に call_ended / done になりませんでした"
      : "退出に失敗しました";
    return Response.json({ error }, { status: result.timeout ? 504 : 502 });
  } catch (error) {
    const status =
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 502;
    const message = error instanceof Error ? error.message : "退出に失敗しました";
    return Response.json({ error: message }, { status });
  }
}
