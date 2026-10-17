import { ScaledCamera } from "./ScaledCamera";
import styles from "./MeetScene.module.css";

const participants = [
  { name: "山田 健太", position: "0% 0%", muted: false },
  { name: "佐藤 陽菜", position: "100% 0%", muted: false },
  { name: "鈴木 直樹", position: "0% 100%", muted: true },
  { name: "高橋 美咲", position: "100% 100%", muted: true },
] as const;

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const icons = {
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  camera: "M3 7h12v10H3zM15 10l6-3v10l-6-3",
  captions: "M3 6h18v12H3zM7 13h3M7 10h6M14 13h3",
  hand: "M8 12V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 6 17l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 13",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  phone: "M4 14c4-4 12-4 16 0l-2 3-3-1v-2a10 10 0 0 0-6 0v2l-3 1z",
};

/** Google Meet-style illustration: participants fill the grid, AIDA takes the last tile at the edge. */
export function MeetScene() {
  return (
    <div
      className={styles.scene}
      role="img"
      aria-label="Google Meet の会議画面のイメージ。4人の参加者が大きく映り、右下の端にAIDAのタイルがあり、AIDAのカメラ表示に「議題に戻ってみませんか」と表示されている。"
    >
      <div className={styles.grid}>
        {participants.map((participant) => (
          <div key={participant.name} className={styles.tile}>
            <div className={styles.photo} style={{ backgroundPosition: participant.position }} />
            <span className={styles.nameTag}>{participant.name}</span>
            {participant.muted ? (
              <span className={styles.muted}>
                <Icon path={icons.mic} />
              </span>
            ) : null}
          </div>
        ))}
        <div className={`${styles.tile} ${styles.aidaTile}`}>
          <ScaledCamera mode="off-track" />
          <span className={styles.nameTag}>AIDA</span>
        </div>
      </div>
      <div className={styles.toolbar}>
        <span className={styles.meetingName}>プロダクト定例</span>
        <span className={styles.tools}>
          <span className={styles.tool}><Icon path={icons.mic} /></span>
          <span className={styles.tool}><Icon path={icons.camera} /></span>
          <span className={styles.tool}><Icon path={icons.captions} /></span>
          <span className={styles.tool}><Icon path={icons.hand} /></span>
          <span className={styles.tool}><Icon path={icons.more} /></span>
          <span className={`${styles.tool} ${styles.leave}`}><Icon path={icons.phone} /></span>
        </span>
        <span className={styles.count}>5人</span>
      </div>
    </div>
  );
}
