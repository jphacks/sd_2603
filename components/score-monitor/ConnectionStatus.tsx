"use client";
import { useState } from "react";
import { checkJevConnection } from "../../app/monitor/actions";
import type { MonitorResponse } from "../../lib/monitor/schema";
import type { Connection } from "./ScoreMonitor";

const jevLabels = {
  ready: "設定済み（API疎通は未確認）",
  mock: "Mockモード（実Jevは無効）",
  blocked: "有料APIの実行が無効",
  missing_key: "APIキーが未設定",
  unknown_provider: "判定プロバイダーの設定を確認してください",
};
export function ConnectionStatus({ data, connection, problem }: {
  data: MonitorResponse | null; connection: Connection; problem: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [probe, setProbe] = useState<Awaited<ReturnType<typeof checkJevConnection>> | null>(null);
  async function check() {
    setPending(true);
    try { setProbe(await checkJevConnection()); }
    catch { setProbe({ ok: false, model: undefined, latencyMs: undefined, checkedAt: undefined, error: "接続確認の応答を取得できませんでした。" }); }
    finally { setPending(false); }
  }
  return (
    <section aria-label="接続と判定の状態" style={{ marginBottom: 16, padding: 12, border: "1px solid #38505e", borderRadius: 8, color: "#afc3cd", fontSize: 12 }}>
      <div>モニターAPI: {connection === "connected" ? "接続済み" : connection === "connecting" ? "接続確認中" : connection === "forbidden" ? "表示権限なし" : connection === "invalid" ? "応答形式エラー" : "通信エラー・再接続待ち"}</div>
      <div>対象会議: {data?.sessionId ? "特定済み" : "未特定（参加したブラウザで会議URLを確認してください）"}</div>
      <div>Jev: {data?.runtime ? data.runtime.jev === "ready" && probe?.ok ? "API疎通確認済み（下記の確認時刻時点）" : jevLabels[data.runtime.jev] : "設定状況を取得していません"}</div>
      <div>会議音声の自動判定: {data?.runtime?.audio === "enabled" ? "有効（音声受信・ワーカー稼働は別途確認）" : data?.runtime ? "無効 — Botの入室だけでは自動判定は始まりません" : "未確認"}</div>
      <div>会議の判定: {data?.snapshot?.scores ? "実スコア受信済み" : "初回の実スコアを待っています"}</div>
      {problem && <p role="alert">{problem}</p>}
      {data?.runtime?.canProbe && <>
        <button type="button" onClick={() => void check()} disabled={pending || data.runtime.jev !== "ready"} style={{ marginTop: 10, border: "1px solid #617c8c", padding: "6px 10px", borderRadius: 6 }}>
          {pending ? "Jevの疎通確認中…" : "JevのAPI疎通を確認"}
        </button>
        <p style={{ margin: "6px 0 0", fontSize: 11 }}>確認用の短い入力を1回送信します。API利用料が発生します。結果は会議のグラフに混ぜません。</p>
      </>}
      {probe && <p role="status">{probe.ok ? `Jev疎通確認成功 · ${probe.model} · ${probe.latencyMs}ms` : probe.error}{probe.checkedAt ? ` · 確認時刻 ${new Date(probe.checkedAt).toLocaleTimeString("ja-JP")}` : ""}</p>}
    </section>
  );
}
