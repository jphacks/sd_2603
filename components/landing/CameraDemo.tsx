"use client";

import { useState } from "react";
import {
  RecallCameraMotion,
  type CameraMotionMode,
  type CameraMotionRequest,
} from "@/components/recall/RecallCameraMotion";
import styles from "./CameraDemo.module.css";

const modes: { mode: CameraMotionMode; label: string; note: string }[] = [
  {
    mode: "on-track",
    label: "順調",
    note: "緑の円が浮遊するだけで、文章は表示しません。脱線・沈黙から戻したときは、色だけを2秒かけて戻します。",
  },
  {
    mode: "off-track",
    label: "脱線",
    note: "4秒間の強調で変化を伝え、淡い色へ移り始めると同時に「議題に／戻ってみませんか」を表示します。",
  },
  {
    mode: "silence",
    label: "沈黙",
    note: "同じ4秒間の強調のあと、淡い色へ移り始めると同時に「気になることは／ありますか？」を表示します。",
  },
];

export function CameraDemo() {
  const [request, setRequest] = useState<CameraMotionRequest>({ mode: "on-track", id: 0 });
  const current = modes.find((item) => item.mode === request.mode) ?? modes[0];

  const play = (mode: CameraMotionMode) => {
    setRequest((previous) => ({ mode, id: previous.id + 1 }));
  };

  return (
    <div className={styles.demo}>
      <figure className={styles.screen}>
        <RecallCameraMotion inline request={request} />
        <figcaption className={styles.caption}>
          実装中のカメラ表示コンポーネントを、このページでそのまま動かしています。画面内の「Focus」は開発中の旧表記です。
        </figcaption>
      </figure>

      <div className={styles.panel}>
        <p className={styles.panelLabel} id="camera-demo-label">表示する状態</p>
        <div className={styles.modeButtons} role="group" aria-labelledby="camera-demo-label">
          {modes.map((item) => (
            <button
              key={item.mode}
              type="button"
              className={styles.modeButton}
              aria-pressed={request.mode === item.mode}
              onClick={() => play(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className={styles.note} aria-live="polite">
          <strong>{current.label}</strong>
          {current.note}
        </p>
        <button
          type="button"
          className={styles.replay}
          onClick={() => play(request.mode)}
          disabled={request.mode === "on-track"}
        >
          {request.mode === "on-track" ? "順調は通常の動きのみ" : "もう一度再生"}
        </button>
        <p className={styles.small}>
          ブラウザ内の表示だけを再生します。会議への参加や外部サービスへの送信は行いません。
        </p>
      </div>
    </div>
  );
}
