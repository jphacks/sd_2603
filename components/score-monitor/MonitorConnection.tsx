"use client";
import { useEffect, useState } from "react";
import { acceptMonitorResponse, MonitorResponseSchema } from "../../lib/monitor/schema";
import type { MonitorResponse } from "../../lib/monitor/schema";
import { ConnectionStatus } from "./ConnectionStatus";
import { ScoreMonitor } from "./ScoreMonitor";
import type { Connection } from "./ScoreMonitor";

export function MonitorConnection({ sessionId, meetingUrl }: { sessionId?: string; meetingUrl?: string }) {
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function tick() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const response = await fetch(
            sessionId ? `/api/monitor/${encodeURIComponent(sessionId)}` : meetingUrl ? `/api/monitor?meeting=${encodeURIComponent(meetingUrl)}` : "/api/monitor",
            { cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) },
          );
          if (!response.ok) {
            if (!stopped) {
              setConnection(response.status === 401 || response.status === 403 ? "forbidden" : "disconnected");
              setProblem(response.status === 401 || response.status === 403
                ? "この会議を表示できません。会議に参加した同じブラウザで開いてください。"
                : "モニターAPIへ接続できません。再接続しています。");
            }
          } else {
            const parsed = MonitorResponseSchema.safeParse(await response.json());
            if (!parsed.success || (sessionId && parsed.data.sessionId !== sessionId)) {
              if (!stopped) setConnection("invalid");
            } else if (!stopped) {
              setData((previous) => acceptMonitorResponse(previous, parsed.data));
              setConnection("connected");
              setProblem(null);
            }
          }
        } catch {
          if (!stopped) {
            setConnection("disconnected");
            setProblem("モニターAPIの応答がありません。再接続しています。");
          }
        }
      }
      if (!stopped) timer = setTimeout(tick, 2000);
    }
    void tick();
    return () => {
      stopped = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [sessionId, meetingUrl]);
  return (
    <div style={{ width: "100%", maxWidth: 560 }}>
      <p style={{ color: "#afc3cd", fontSize: 13, margin: "0 0 12px", overflowWrap: "anywhere" }}>
        {meetingUrl ? `会議: ${meetingUrl}` : sessionId ? "選択した会議" : "参加中の会議を自動表示"}
        {data?.sessionId ? ` · MTG ID: ${data.sessionId}` : meetingUrl ? " · この会議の参加情報を待っています" : " · 会議への参加を待っています"}
        <br />会議でJevが判定するたびに更新します（2秒ごとに取得）。
      </p>
      <ConnectionStatus data={data} connection={connection} problem={problem} />
      <ScoreMonitor envelope={data} connection={connection} />
    </div>
  );
}
