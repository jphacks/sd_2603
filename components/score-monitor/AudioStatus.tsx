import type { MonitorResponse } from "../../lib/monitor/schema";

export function AudioStatus({ runtime }: { runtime: MonitorResponse["runtime"] }) {
  return (
    <p aria-label="音声自動判定の設定" style={{ marginBottom: 16, padding: 12, border: "1px solid #38505e", borderRadius: 8, color: "#afc3cd", fontSize: 12 }}>
      音声自動判定（設定）: {runtime ? runtime.audio === "enabled" ? "有効" : "無効" : "未確認"}
    </p>
  );
}
