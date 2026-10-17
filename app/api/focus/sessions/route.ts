import { z } from "zod";
import { createSession, sameSecret } from "@/lib/focus/store";
import { apiError, bearer, input, privateJson } from "@/lib/focus/http";
import { FocusError } from "@/lib/focus/model";

export async function POST(request: Request) {
  try {
    const hostname = new URL(request.url).hostname;
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    if (!local && !sameSecret(bearer(request), process.env.FOCUS_CONTROL_KEY ?? "")) throw new FocusError("操作キーを入力してください。", 401);
    const body = z.object({ title: z.string().trim().min(1).max(100) }).safeParse(await input(request));
    if (!body.success) throw new FocusError("会議名を100文字以内で入力してください。");
    return privateJson(await createSession(body.data.title), 201);
  } catch (error) { return apiError(error); }
}
