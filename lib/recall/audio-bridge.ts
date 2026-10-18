import { workerRequest } from "../../scripts/transcription/bridge.mjs";

export function remoteAudioEnabled() {
  return process.env.ENABLE_REALTIME_TRANSCRIPTION === "true" && Boolean(process.env.RECALL_AUDIO_WORKER_URL);
}

export async function audioBridge(botId: string, path: string, extra: Record<string, unknown> = {}) {
  try {
    const response = await workerRequest(process.env, "/bridge", { botId, path, ...extra });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ error: "音声接続先から正常な応答がありません。", diagnostic: { stage: "worker_http", status: response.status } }, { status: 503 });
    }
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const cause = error instanceof Error ? error.cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    const safeCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"];
    return Response.json({ error: "音声処理サーバーに接続できません。自動判定は停止しています。", diagnostic: { stage: "worker_transport", name: ["TypeError", "TimeoutError", "AbortError"].includes(name) ? name : "OtherError", ...(typeof code === "string" && safeCodes.includes(code) ? { code } : {}) } }, { status: 503 });
  }
}

export async function stopRemoteAudio(botId: string) {
  const response = await workerRequest(process.env, "/sessions/stop", { botId });
  if (!response.ok && response.status !== 404) throw new Error("Audio session stop failed");
}
