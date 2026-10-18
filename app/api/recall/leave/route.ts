import { readFile } from "node:fs/promises";
import { localRecallIo, removeBot } from "@/scripts/recall.mjs";
import { monitorStore } from "@/lib/monitor/store";
import { controlAccessError } from "@/lib/recall/controller";

export async function POST(request: Request) {
  const denied = controlAccessError(request, process.env.RECALL_CONTROL_TOKEN);
  if (denied) return denied;
  const io = localRecallIo();
  let id = "";
  try {
    const state = JSON.parse(await readFile(io.statePath, "utf8")) as { id?: string };
    id = typeof state.id === "string" ? state.id : "";
  } catch {
    id = "";
  }
  if (!id) {
    return Response.json({ error: "退出するボットがありません。" }, { status: 404 });
  }

  try {
    const result = await removeBot(io, id);
    if (result.left) {
      monitorStore.deactivate(id);
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
