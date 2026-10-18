import { workerRequest } from "../../scripts/transcription/bridge.mjs";

export function remoteAudioEnabled() {
  return process.env.ENABLE_REALTIME_TRANSCRIPTION === "true" && Boolean(process.env.RECALL_AUDIO_WORKER_URL);
}

export async function audioBridge(botId: string, path: string, extra: Record<string, unknown> = {}) {
  try {
    const response = await workerRequest(process.env, "/bridge", { botId, path, ...extra });
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "音声処理サーバーに接続できません。自動判定は停止しています。" }, { status: 503 });
  }
}

export async function stopRemoteAudio(botId: string) {
  const response = await workerRequest(process.env, "/sessions/stop", { botId });
  if (!response.ok && response.status !== 404) throw new Error("Audio session stop failed");
}
