"use client";
import { useEffect, useState } from "react";
import {
  SCORE_KEYS,
  SCORE_META,
  remainingCooldown,
} from "../../lib/monitor/schema";
import type { Envelope, Snapshot } from "../../lib/monitor/schema";
import { AidaFace, expressionLabel } from "./AidaFace";
import type { AidaExpression } from "./AidaFace";
import { monitorCss } from "./styles";

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
          return (
            <div key={key} className="jm-channel">
              <strong>
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
                      borderTop: "2px solid #000",
                    }}
                  />
                )}
                <span className="jm-threshold" style={{ bottom: "60%" }}>
                  60
                </span>
                {key !== "tangentIsRelevant" && (
                  <span className="jm-threshold" style={{ bottom: "40%" }}>
                    40
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
        有用性60%は脱線時の補助線です。高い有用性は警告ではありません。
      </p>
    </div>
  );
}

// 判定は AIDA の行動で見せる（DESIGN.md「表情」）。WAIT も SILENCE と同じ「見守る」。
function expressionFor(snapshot: Snapshot | null): AidaExpression {
  if (snapshot?.decision !== "INTERVENE") return "watching";
  return snapshot.reasonCode === "DRIFTED_IRRELEVANT" ? "redirect" : "nudge";
}

export function DecisionView({
  snapshot,
  now,
}: {
  snapshot: Snapshot | null;
  now: number;
}) {
  const expression = expressionFor(snapshot);
  return (
    <section className="jm-decision" aria-live="polite">
      <div className="jm-eyebrow">CURRENT DECISION</div>
      <div className="jm-decision-row">
        <AidaFace expression={expression} />
        <div>
          <strong>{snapshot ? expressionLabel(expression) : "未取得"}</strong>
          <span>
            {snapshot
              ? descriptions[snapshot.reasonCode]
              : "Jevの評価を待っています"}
          </span>
        </div>
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
          <span className="jm-status" data-live={label === "接続済み"}>
            {label}
          </span>
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
