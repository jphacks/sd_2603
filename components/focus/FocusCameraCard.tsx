import { FocusMark } from "./FocusMark";
import { cameraDemos, type CameraDemoMode } from "@/lib/focus/camera-demo";

export type FocusCameraCardProps = {
  message: string | null;
  closed?: boolean;
  connected?: boolean;
  demoMode?: CameraDemoMode | null;
};

export function FocusCameraCard({ message, closed = false, connected = true, demoMode = null }: FocusCameraCardProps) {
  const demo = cameraDemos[demoMode ?? "on-track"];
  return <section aria-label="Focusのカメラ表示" className="focus-camera-card" style={{ backgroundImage: `url("${demo.background}")` }}>
    <div className="focus-camera-center">
      <span className="focus-camera-state-label">{closed ? "終了" : !connected ? "接続待機" : message ? "Focus" : demo.label}</span>
      <h1 className={message ? "focus-camera-custom-message" : undefined}>{closed ? "おつかれ\nさまでした" : !connected ? "接続を\n確認しています" : message || demo.message}</h1>
    </div>
    <div className="focus-camera-footer"><span><FocusMark /> Focus</span><span className="focus-camera-status"><i className={connected ? "" : "offline"} />{closed ? "終了" : !connected ? "接続待機" : message ? "表示中" : "デモ表示"}</span></div>
  </section>;
}
