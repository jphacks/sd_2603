import { z } from "zod";
import { loadSession, updateSession } from "@/lib/focus/store";
import { applyAction, cameraState, FocusError } from "@/lib/focus/model";
import { apiError, bearer, input, privateJson } from "@/lib/focus/http";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("agenda"), agenda: z.string().max(20000) }),
  z.object({ action: z.literal("note"), text: z.string().trim().min(1).max(4000), agenda: z.string().max(20000).optional() }),
  z.object({ action: z.literal("propose"), message: z.string().trim().min(1).max(500) }),
  z.object({ action: z.enum(["share", "defer"]), proposalId: z.string().uuid() }),
  z.object({ action: z.enum(["clear", "close"]) }),
]);

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const camera = new URL(request.url).searchParams.get("view") === "camera";
    const session = await loadSession(id, bearer(request), camera ? "camera" : "control");
    return privateJson(camera ? cameraState(session) : session);
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = z.object({ revision: z.number().int().min(0), change: action }).safeParse(await input(request));
    if (!body.success) throw new FocusError("入力が正しくありません。文字数と内容を確認してください。");
    const session = await updateSession(id, bearer(request), body.data.revision, current => applyAction(current, body.data.change));
    return privateJson(session);
  } catch (error) { return apiError(error); }
}
