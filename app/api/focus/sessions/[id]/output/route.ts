import { z } from "zod";
import { loadSession } from "@/lib/focus/store";
import { FocusError } from "@/lib/focus/model";
import { apiError, bearer, input, privateJson } from "@/lib/focus/http";
import { startCameraOutput } from "@/lib/recall/output";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await loadSession(id, bearer(request));
    if (session.closed) throw new FocusError("この会議は終了しています。", 409);
    const parsed = z.object({ botId: z.string().uuid(), cameraToken: z.string().min(40).max(100) }).safeParse(await input(request));
    if (!parsed.success) throw new FocusError("正しいBot IDを入力してください。");
    await loadSession(id, parsed.data.cameraToken, "camera");
    const base = process.env.FOCUS_PUBLIC_BASE_URL;
    const key = process.env.RECALL_API_KEY;
    const region = process.env.RECALL_REGION || "ap-northeast-1";
    if (!base || !key) throw new FocusError("RECALL_API_KEYとFOCUS_PUBLIC_BASE_URLを設定してください。", 503);
    if (!["ap-northeast-1", "us-east-1", "us-west-2", "eu-central-1"].includes(region)) throw new FocusError("Recallのリージョンを確認してください。", 503);
    const origin = new URL(base);
    if (origin.protocol !== "https:" || origin.username || origin.password || ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new FocusError("Focusの公開HTTPS URLを設定してください。", 503);
    const cameraUrl = new URL(`/focus/camera/${id}`, origin.origin);
    cameraUrl.hash = new URLSearchParams({ token: parsed.data.cameraToken }).toString();
    const status = await startCameraOutput({ apiKey: key, region, botId: parsed.data.botId, cameraUrl: cameraUrl.href });
    if (status < 200 || status >= 300) throw new FocusError(status === 401 || status === 403 ? "Recallのキー・リージョン・権限を確認してください。" : "カメラ出力を開始できません。Botの入室状態を確認してください。", 502);
    return privateJson({ message: "Recallにカメラ出力を要求しました。会議上で表示を確認してください。" });
  } catch (error) { return apiError(error); }
}
