import { z } from "zod";
import { extractVideoUrl } from "@/lib/recall/video";

const regions = new Set(["ap-northeast-1", "us-east-1", "us-west-2", "eu-central-1"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  // The app has no user authentication yet. Protect workspace media in deployments.
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return Response.json({ error: "Bot IDからの取得はローカル開発のみ利用できます。公開環境には認証を追加してください。" }, { status: 403 });
  }
  const parsed = z.string().uuid().safeParse(url.searchParams.get("botId"));
  if (!parsed.success) return Response.json({ error: "正しいBot ID（UUID）を入力してください。" }, { status: 400 });
  const key = process.env.RECALL_API_KEY?.trim();
  const region = process.env.RECALL_REGION?.trim() || "ap-northeast-1";
  if (!key) return Response.json({ error: "サーバーのRECALL_API_KEYを設定してください。" }, { status: 503 });
  if (!regions.has(region)) return Response.json({ error: "RECALL_REGIONが正しくありません。" }, { status: 503 });
  try {
    const response = await fetch(`https://${region}.recall.ai/api/v1/bot/${parsed.data}/`, {
      headers: { Authorization: `Token ${key}`, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = response.status === 401 || response.status === 403
        ? "Recallのキーまたはリージョンを確認してください。"
        : response.status === 404 ? "ボットが見つかりません。" : "Recallから映像情報を取得できませんでした。";
      return Response.json({ error }, { status: response.status === 404 ? 404 : 502 });
    }
    const videoUrl = extractVideoUrl(await response.json());
    return Response.json({ videoUrl, message: videoUrl ? null : "再生可能な録画はまだありません。録画の完了とvideo_mixedの設定を確認してください。" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: timeout ? "Recallへの接続がタイムアウトしました。" : "Recallの映像情報を読み込めませんでした。" }, { status: timeout ? 504 : 502 });
  }
}
