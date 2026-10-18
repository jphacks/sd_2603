"use client";
import { useEffect, useState } from "react";
import {
  SCORE_KEYS,
  SCORE_META,
  remainingCooldown,
} from "../../lib/monitor/schema";
import type { Envelope, Snapshot } from "../../lib/monitor/schema";
import { monitorCss } from "./styles";
import policy from "../../lib/judge/jev-policy.json";

export type Connection =
  "connecting" | "connected" | "disconnected" | "invalid";
const descriptions = {
  COOLDOWN: "介入後のクールダウン",
  INSUFFICIENT_CONTEXT: "会話の蓄積を待つ",
  STALLED: "整理を促す",
  DRIFTED_IRRELEVANT: "議題に戻す",
  OBSERVE: "もう少し観察",
  ON_TOPIC: "介入しない",
  OTHER: "アプリの判定を表示",
};

export function MeterView({ snapshot }: { snapshot: Snapshot | null }) {
  return (
    <div>
      <div className="jm-meters">
        {SCORE_KEYS.map((key) => {
          const score = snapshot?.scores?.[key];
          const threshold = key === "drifted" ? policy.driftThreshold
            : key === "stalled" ? policy.stallThreshold : policy.relevanceThreshold;
          return (
            <div key={key} className="jm-channel">
              <strong style={{ color: SCORE_META[key].color }}>
                {score == null ? "—" : `${(score * 100).toFixed(1)}%`}
              </strong>
              <div
                className="jm-bar"
                aria-label={`${SCORE_META[key].label} ${score == null ? "未取得" : `${(score * 100).toFixed(1)}%`}`}
              >
                {score != null && (
                  <div
                    className="jm-fill"
                    style={{
                      height: `${score * 100}%`,
                      background: SCORE_META[key].color,
                    }}
                  />
                )}
                <span className="jm-threshold" style={{ bottom: `${threshold * 100}%` }}>
                  {threshold * 100}
                </span>
                {key !== "tangentIsRelevant" && (
                  <span className="jm-threshold" style={{ bottom: `${policy.uncertainThreshold * 100}%` }}>
                    {policy.uncertainThreshold * 100}
                  </span>
                )}
              </div>
              <span>{SCORE_META[key].label}</span>
              <code>{key}</code>
            </div>
          );
        })}
      </div>
      <p className="jm-note">
        有用性{policy.relevanceThreshold * 100}%は脱線時の補助線です。高い有用性は警告ではありません。
      </p>
    </div>
  );
}

export function DecisionView({
  snapshot,
  now,
}: {
  snapshot: Snapshot | null;
  now: number;
}) {
  const color =
    snapshot?.decision === "INTERVENE"
      ? "#f29689"
      : snapshot?.decision === "WAIT"
        ? "#e8bc69"
        : "#83d5b9";
  return (
    <section className="jm-decision" aria-live="polite">
      <div className="jm-eyebrow">CURRENT DECISION</div>
      <div className="jm-decision-row">
        <strong style={{ color }}>{snapshot?.decision ?? "未取得"}</strong>
        <span>
          {snapshot
            ? descriptions[snapshot.reasonCode]
            : "Jevの評価を待っています"}
        </span>
      </div>
      <p>{snapshot?.reason ?? "まだ判定データはありません"}</p>
      <div className="jm-footer">
        <span>クールダウン {remainingCooldown(snapshot, now)}秒</span>
        <span>
          {snapshot?.lastIntervenedAt == null
            ? "実介入の記録なし"
            : "実介入の成功時刻を使用"}
        </span>
      </div>
    </section>
  );
}

export function ScoreMonitor({
  envelope,
  connection,
}: {
  envelope: Envelope | null;
  connection: Connection;
}) {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setClock(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, []);
  const snapshot = envelope?.snapshot ?? null;
  const now = clock || snapshot?.evaluatedAt || 0;
  const age =
    snapshot?.scoresAt == null ? null : Math.max(0, now - snapshot.scoresAt);
  const stale =
    age != null &&
    envelope?.expectedIntervalMs != null &&
    age > envelope.expectedIntervalMs * 3;
  const label =
    connection === "invalid"
      ? "入力エラー"
      : connection === "disconnected"
        ? "切断・再接続待ち"
        : connection === "connecting"
          ? "接続中"
          : stale
            ? "更新停止"
            : !snapshot?.scores
              ? "実スコア未取得"
              : "接続済み";
  return (
    <section className="jev-monitor">
      <style>{monitorCss}</style>
      <header className="jm-header">
        <div>
          <div className="jm-eyebrow">JEV SIGNAL MONITOR</div>
          <span className="jm-status">● {label}</span>
        </div>
      </header>
      <div className="jm-score-heading">
        <span>現在の判定スコア</span>
        <span>{age == null ? "—" : `${Math.floor(age / 1000)}秒前の実測`}</span>
      </div>
      <MeterView snapshot={snapshot} />
      <DecisionView snapshot={snapshot} now={now} />
      <p className="jm-note">
        {snapshot
          ? `Session ${snapshot.sessionId} · #${snapshot.sequence}`
          : "セッションの応答を待機"}
        {envelope?.expectedIntervalMs == null
          ? " · 評価間隔を測定中"
          : ` · ${Math.round(envelope.expectedIntervalMs / 1000)}秒間隔の3倍で更新停止を判定`}
      </p>
    </section>
  );
}
