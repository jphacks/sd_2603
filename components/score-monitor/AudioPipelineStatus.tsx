"use client";

import { useEffect, useState } from "react";

type AudioStatus = {
  enabled?: boolean;
  connected?: boolean;
  failed?: boolean;
  message?: string;
  counts?: { rawFrames: number; voicedFrames: number; sttFinal: number; jevDecisions: number } | null;
};

export function AudioPipelineStatus({ botId }: { botId: string }) {
  const [status, setStatus] = useState<AudioStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/recall/audio-status?botId=${encodeURIComponent(botId)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!controller.signal.aborted) setStatus(response.ok ? body : { failed: true, message: body.message ?? body.error ?? "音声接続を確認できません。" });
      } catch {
        if (!controller.signal.aborted) setStatus({ failed: true, message: "音声接続を確認できません。" });
      } finally { if (!controller.signal.aborted) timer = setTimeout(poll, 3000); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [botId]);
  const counts = status?.counts;
  const message = !status ? "音声接続を確認中…"
    : status.failed ? status.message ?? "音声処理が停止しています。退出後に接続設定を確認してください。"
    : !status.enabled ? status.message ?? "音声の自動判定は無効です。"
    : !status.connected ? "Recallからの音声接続待ちです。"
    : !counts?.rawFrames ? "音声接続済み・データ待ちです。"
    : !counts.voicedFrames ? "音声データ受信中・発話待ちです。"
    : !counts.sttFinal ? "音声受信中・文字起こし待ちです。"
    : !counts.jevDecisions ? "文字起こし済み・Jev判定待ちです。"
    : "Jevで判定中です。";
  return <div role="status" className="mb-4 rounded-lg border border-slate-600 p-3 text-sm text-slate-100">
    <p>{message}</p>
    {counts && <p className="mt-1 text-xs text-slate-300">文字起こし {counts.sttFinal}件 ／ Jev判定 {counts.jevDecisions}件</p>}
  </div>;
}
