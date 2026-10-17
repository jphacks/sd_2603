"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import styles from "./RecallCameraMotion.module.css";

export type CameraMotionMode = "on-track" | "off-track" | "silence";

type CameraPresentation = {
  label: string;
  lines: [string, string];
  background: string;
  orbRgb: string;
  strongRgb: string;
};

const presentations: Record<CameraMotionMode, CameraPresentation> = {
  "on-track": {
    label: "順調",
    lines: ["良いペースで", "進んでいます"],
    background: "/focus-states/state-on-track-green-centered-pale.png",
    orbRgb: "129 205 157",
    strongRgb: "59 181 111",
  },
  "off-track": {
    label: "脱線",
    lines: ["議題に", "戻ってみませんか"],
    background: "/focus-states/state-off-track-orange-centered-pale.png",
    orbRgb: "244 178 104",
    strongRgb: "238 38 50",
  },
  silence: {
    label: "沈黙",
    lines: ["気になることは", "ありますか？"],
    background: "/focus-states/state-silence-blue-centered-pale.png",
    orbRgb: "112 169 245",
    strongRgb: "30 76 196",
  },
};

export type CameraMotionRequest = { mode: CameraMotionMode; id: number };

type RecallCameraMotionProps = {
  initialMode?: CameraMotionMode;
  embedded?: boolean;
  autoplay?: boolean;
  /** Renders only the camera frame inside another page, without the preview controls. */
  inline?: boolean;
  /** Switches the mode from outside; a new id replays the same transition as the preview buttons. */
  request?: CameraMotionRequest;
};

type MotionPhase = "calm" | "attention" | "settling" | "message" | "returning";

export function RecallCameraMotion({
  initialMode = "on-track",
  embedded = false,
  autoplay = false,
  inline = false,
  request,
}: RecallCameraMotionProps) {
  const [mode, setMode] = useState<CameraMotionMode>(initialMode);
  const [phase, setPhase] = useState<MotionPhase>(
    initialMode === "on-track" ? "calm" : "attention",
  );
  const [motionId, setMotionId] = useState(0);
  const [returnPresentation, setReturnPresentation] = useState<CameraPresentation | null>(null);
  const presentation = presentations[mode];
  const visualPresentation = phase === "returning" && returnPresentation
    ? returnPresentation
    : presentation;

  const chooseMode = (nextMode: CameraMotionMode) => {
    setMotionId((value) => value + 1);
    if (nextMode === "on-track") {
      if (mode === "on-track") {
        setPhase("calm");
        return;
      }
      setReturnPresentation(presentations[mode]);
      setMode("on-track");
      setPhase("returning");
      return;
    }
    setReturnPresentation(null);
    setMode(nextMode);
    setPhase("attention");
  };

  const [handledRequestId, setHandledRequestId] = useState(request?.id);
  if (request && request.id !== handledRequestId) {
    setHandledRequestId(request.id);
    chooseMode(request.mode);
  }

  const playAttention = useCallback(() => {
    if (mode === "on-track") return;
    setMotionId((value) => value + 1);
    setPhase("attention");
  }, [mode]);

  useEffect(() => {
    const duration = phase === "attention"
      ? 4000
      : phase === "settling" || phase === "returning"
        ? 2000
        : null;
    if (duration === null) return;
    const timer = setTimeout(() => {
      setPhase((currentPhase) => currentPhase === "attention"
        ? "settling"
        : currentPhase === "settling"
          ? "message"
          : "calm");
    }, duration);
    return () => clearTimeout(timer);
  }, [mode, motionId, phase]);

  useEffect(() => {
    if (!autoplay || mode === "on-track") return;
    const repeatingPreview = setInterval(playAttention, 10000);
    return () => clearInterval(repeatingPreview);
  }, [autoplay, mode, playAttention]);

  const stageStyle = {
    "--target-background": `url("${visualPresentation.background}")`,
    "--orb-rgb": visualPresentation.orbRgb,
    "--strong-rgb": visualPresentation.strongRgb,
  } as CSSProperties;

  const phaseClass = phase === "attention"
    ? styles.attention
    : phase === "settling"
      ? styles.settling
    : phase === "message"
      ? styles.messageVisible
      : phase === "returning"
        ? styles.returning
      : "";

  const Root = inline ? "div" : "main";

  return (
    <Root
      className={`${styles.page} ${embedded ? styles.embedded : ""} ${inline ? styles.inline : ""}`}
      style={stageStyle}
    >
      <section className={styles.cameraFrame} aria-label="FocusのRecallカメラ出力">
        <div className={styles.stage}>
          <div className={styles.baseBackground} aria-hidden="true" />
          <div
            key={`background-${mode}-${motionId}`}
            className={`${styles.targetBackground} ${phaseClass}`}
            aria-hidden="true"
          />
          <div className={`${styles.alertBackground} ${phaseClass}`} aria-hidden="true" />
          <div
            key={`${mode}-${motionId}`}
            className={`${styles.motionLayer} ${phaseClass}`}
          >
            <div className={styles.orbMotion} aria-hidden="true">
              <span className={`${styles.orb} ${styles.baseOrb}`}><i className={styles.orbCore} /></span>
              {(mode !== "on-track" || phase === "returning") && (
                <span className={`${styles.orb} ${styles.targetOrb}`}><i className={styles.orbCore} /></span>
              )}
              {mode !== "on-track" && (
                <span className={`${styles.orb} ${styles.alertOrb}`}><i className={styles.orbCore} /></span>
              )}
            </div>
            {mode !== "on-track" && (phase === "settling" || phase === "message") && (
              <div className={styles.message} role="status" aria-live="polite">
                <span className={styles.stateLabel}>{presentation.label}</span>
                <p>
                  <span>{presentation.lines[0]}</span>
                  <span>{presentation.lines[1]}</span>
                </p>
              </div>
            )}
          </div>
          <footer className={styles.cameraFooter}>
            <span className={styles.brand}><i aria-hidden="true" />Focus</span>
            <span className={styles.liveState}><i aria-hidden="true" />
              {phase === "attention"
                ? "変化を検知"
                : phase === "settling"
                  ? "状態を確認中"
                  : phase === "message"
                    ? presentation.label
                    : phase === "returning"
                      ? "順調に復帰"
                      : "見守り中"}
            </span>
          </footer>
        </div>
      </section>

      {!embedded && !inline && (
        <section className={styles.controls} aria-label="カメラモーションの表示確認">
          <div>
            <p className={styles.controlEyebrow}>CAMERA MOTION PREVIEW</p>
            <h1>Focusのカメラ表示</h1>
            <p>脱線・沈黙では4秒間の強調後、2秒で淡色へ落ち着いてから文章を表示します。</p>
          </div>
          <div className={styles.controlActions}>
            <div className={styles.modeButtons}>
              {(Object.keys(presentations) as CameraMotionMode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={mode === item}
                  onClick={() => chooseMode(item)}
                >
                  {presentations[item].label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.replayButton}
              onClick={playAttention}
              disabled={mode === "on-track"}
            >
              {mode === "on-track" ? "順調は通常モーションのみ" : "4秒モーションを再生"}
            </button>
          </div>
        </section>
      )}
    </Root>
  );
}
