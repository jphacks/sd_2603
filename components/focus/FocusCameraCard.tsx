import { FocusMark } from "./FocusMark";

export type FocusCameraCardProps = {
  message: string | null;
  closed?: boolean;
  connected?: boolean;
};

export function FocusCameraCard({ message, closed = false, connected = true }: FocusCameraCardProps) {
  return <section aria-label="Focusのカメラ表示" className="focus-camera-card">
    <div className="focus-camera-center">
      <div className={`focus-orb ${message ? "focus-orb-speaking" : ""}`} aria-hidden><span /></div>
      <h1>{closed ? "会議、おつかれさまでした。" : message || "会話に、集中しよう。"}</h1>
      <p>{closed ? "Focusの進行サポートを終了しました" : !connected ? "接続を確認しています" : message ? "進行をサポートする提案です" : "必要なときだけ、そっとサポートします"}</p>
    </div>
    <div className="focus-camera-footer"><span><FocusMark /> Focus · 進行サポート</span><span className="focus-camera-status"><i className={connected ? "" : "offline"} />{closed ? "終了" : connected ? "待機中" : "接続待機"}</span></div>
  </section>;
}
