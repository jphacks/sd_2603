"use client";

import { useEffect, useState } from "react";
import { FocusCameraCard } from "@/components/focus/FocusCameraCard";
import { FocusMark } from "@/components/focus/FocusMark";
import { cameraDemos, type CameraDemoMode } from "@/lib/focus/camera-demo";
import styles from "./MeetingDemo.module.css";
import { MeetingIcon, type MeetingIconName } from "./MeetingIcon";

const participants = [
  { name: "山田 健太", position: "0% 0%", muted: false },
  { name: "佐藤 陽菜", position: "100% 0%", muted: false },
  { name: "鈴木 直樹", position: "0% 100%", muted: true },
  { name: "高橋 美咲", position: "100% 100%", muted: false },
] as const;

const demoSequence: CameraDemoMode[] = ["on-track", "silence", "off-track"];

function ToolButton({ icon, label, active = false, off = false, onClick }: { icon: MeetingIconName; label: string; active?: boolean; off?: boolean; onClick?: () => void }) {
  return <button type="button" title={onClick ? label : `${label}（表示のみ）`} aria-label={label} aria-pressed={onClick ? active : undefined} disabled={!onClick} className={`${styles.toolButton} ${active ? styles.toolActive : ""} ${off ? styles.toolOff : ""}`} onClick={onClick}><MeetingIcon name={icon} off={off} /></button>;
}

export function MeetingDemo() {
  const [mode, setMode] = useState<CameraDemoMode>("off-track");
  const [panelOpen, setPanelOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = window.setInterval(() => {
      setMode(current => demoSequence[(demoSequence.indexOf(current) + 1) % demoSequence.length]);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [autoPlay]);

  function selectMode(nextMode: CameraDemoMode) {
    setMode(nextMode);
    setAutoPlay(false);
  }

  return <main className={styles.demoShell}>
    <section className={styles.meetingArea} aria-label="プロダクト定例のデモ会議">
      <div className={styles.stage}>
        <div className={styles.participantGrid}>
          {participants.map((participant, index) => <article className={styles.participant} key={participant.name}>
            <div className={styles.participantPhoto} style={{ backgroundPosition: participant.position }} role="img" aria-label={`${participant.name}のデモ映像`} />
            <span className={styles.nameTag}>{participant.name}</span>
            {(participant.muted || index === 3) && <span className={styles.mutedBadge} aria-label="ミュート中"><MeetingIcon name="mic" off /></span>}
          </article>)}
          <article className={`${styles.focusTile} ${styles[`mode-${mode}`]}`}>
            <FocusCameraCard message={null} demoMode={mode} />
          </article>
        </div>
      </div>

      <footer className={styles.toolbar}>
        <div className={styles.meetingDetails}><span>15:30</span><span className={styles.detailDivider} /><h1>プロダクト定例</h1><span className={styles.demoBadge}>デモ</span></div>
        <div className={styles.toolbarGroup}>
          <ToolButton icon="mic" label={muted ? "マイクをオンにする" : "マイクをオフにする"} active={muted} off={muted} onClick={() => setMuted(value => !value)} />
          <ToolButton icon="camera" label={cameraOn ? "カメラをオフにする" : "カメラをオンにする"} active={!cameraOn} off={!cameraOn} onClick={() => setCameraOn(value => !value)} />
          <ToolButton icon="captions" label="字幕" />
          <ToolButton icon="hand" label="挙手" />
          <ToolButton icon="present" label="画面を共有" />
          <ToolButton icon="more" label="その他のオプション" />
          <a href="/meeting" className={`${styles.toolButton} ${styles.toolDanger}`} aria-label="デモを終了" title="デモを終了"><MeetingIcon name="phone" /></a>
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.participantCount} title="デモ参加者5人"><MeetingIcon name="people" /><small>5</small></span>
          <button type="button" className={`${styles.focusPill} ${panelOpen ? styles.focusPillActive : ""}`} aria-label="デモ表示設定" aria-expanded={panelOpen} onClick={() => setPanelOpen(value => !value)}><FocusMark /><span><strong>Focus</strong><small>デモ表示</small></span></button>
        </div>
      </footer>
    </section>

    {panelOpen && <aside className={styles.supportPanel} aria-label="デモ表示設定">
      <header className={styles.supportHeader}><span><FocusMark /><strong>表示設定</strong></span><button type="button" onClick={() => setPanelOpen(false)} aria-label="パネルを閉じる">×</button></header>
      <div className={styles.supportBody}>
        <div><p className={styles.eyebrow}>カメラ表示の確認</p><h2>3つの背景を切り替え</h2><p className={styles.monitoring}>参加者は静止画です。実会議への接続や自動判定は行いません。</p></div>
        <div className={styles.demoControls}>
          <div><strong>デモ操作</strong><button type="button" className={autoPlay ? styles.playing : ""} onClick={() => setAutoPlay(value => !value)}>{autoPlay ? "自動再生を停止" : "自動で再生"}</button></div>
          <div className={styles.modeButtons}>{demoSequence.map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => selectMode(value)}>{cameraDemos[value].label}</button>)}</div>
        </div>
      </div>
    </aside>}
  </main>;
}
