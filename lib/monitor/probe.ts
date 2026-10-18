import { JevError, requestJevScores } from "../judge/jev.ts";
import { monitorRuntime } from "./runtime.ts";

type ProbeResult = { status: number; body: {
  ok: boolean; checkedAt: number; model?: string; latencyMs?: number; error?: string; kind?: string;
} };

// A manual check uses synthetic context and never writes a meeting score.
// Share in-flight/recent results so clicks do not create duplicate paid requests.
export function createJevProbe({ env = () => process.env, score = requestJevScores, now = Date.now } = {}) {
  let cached: ProbeResult | undefined;
  let pending: Promise<ProbeResult> | undefined;
  return async (): Promise<ProbeResult> => {
    const settings = env();
    if (monitorRuntime(settings).jev !== "ready") return { status: 503, body: {
      ok: false, checkedAt: now(), kind: "config", error: "Jevの設定が不足しています。判定プロバイダー・有料APIの有効化・APIキーを確認してください。",
    } };
    if (cached && now() - cached.body.checkedAt < 30000) return cached;
    if (pending) return pending;
    pending = (async (): Promise<ProbeResult> => {
      try {
        const result = await score({ agenda: "接続確認用の予定を決める", transcript: ["金曜に確認しましょう。", "私が準備します。", "では金曜に確認します。"], secondsSinceLastIntervention: 60 },
          { apiKey: settings.AI_GATEWAY_API_KEY, model: settings.JEV_MODEL_ID });
        return { status: 200, body: { ok: true, checkedAt: now(), model: result.model, latencyMs: result.latencyMs } };
      } catch (error) {
        const kind = error instanceof JevError ? error.kind : "upstream";
        const message = kind === "auth" ? "Jevの認証に失敗しました。APIキーを確認してください。"
          : kind === "rate_limit" ? "Jevの利用上限に達しています。" : kind === "timeout" ? "Jevへの接続がタイムアウトしました。"
          : "Jevから有効な応答を取得できませんでした。";
        return { status: kind === "rate_limit" ? 429 : kind === "timeout" ? 504 : 502, body: { ok: false, checkedAt: now(), kind, error: message } };
      }
    })();
    try { cached = await pending; return cached; } finally { pending = undefined; }
  };
}
