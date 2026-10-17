"use client";

import { useRef, useState } from "react";
import type { CameraSource } from "@/lib/meeting/types";
import { CameraView } from "./CameraView";
import { MeetChatConnection } from "@/components/focus/MeetChatConnection";
import { FocusCameraCard } from "@/components/focus/FocusCameraCard";
import { FocusMark } from "@/components/focus/FocusMark";
import { useFocusSession } from "@/components/focus/useFocusSession";
import { cameraDemos, type CameraDemoMode } from "@/lib/focus/camera-demo";

export function MeetingWorkspace() {
  const focus = useFocusSession();
  const [title, setTitle] = useState("プロダクト定例");
  const [controlKey, setControlKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [botId, setBotId] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<CameraSource | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const session = focus.session;

  if (!session || session.closed) return <main className="focus-setup"><div className="focus-setup-card"><FocusMark large /><p className="focus-eyebrow">MEETING FACILITATOR</p><h1>{session?.closed ? "おつかれさまでした。" : "会話に、集中しよう。"}</h1><p>必要なときだけ、議論を前へ。<br />Focusの進行サポートを準備しましょう。</p><form onSubmit={async event => { event.preventDefault(); if (await focus.create(title, controlKey)) { setControlKey(""); setNotice(""); } }}><label htmlFor="meeting-title">会議名</label><input id="meeting-title" required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /><details><summary>公開環境の操作キー</summary><label htmlFor="control-key">操作キー</label><input id="control-key" type="password" autoComplete="off" value={controlKey} onChange={event => setControlKey(event.target.value)} /><small>公開環境のみ必要です。</small></details><button className="focus-button focus-primary" disabled={focus.busy}>{focus.busy ? "準備中…" : "会議を準備する →"}</button></form><a className="focus-demo-link" href="/meeting/demo">接続なしで会議デモを見る</a>{focus.error && <p role="alert" className="focus-error">{focus.error}</p>}</div></main>;

  return <main className="focus-workspace"><div className="focus-meeting">
    <header className="focus-meeting-header"><span aria-hidden>♧</span><h1>{session.title}</h1></header>
    <div ref={stageRef} className="focus-stage">{source && <div className="focus-video"><CameraView source={source} /></div>}<div className={source ? "focus-bot-tile focus-bot-small" : "focus-bot-tile"}><FocusCameraCard message={session.sharedMessage} demoMode={session.cameraDemoMode} />{!source && <span className="focus-preview-label">ボットのカメラプレビュー</span>}</div></div>
    <footer className="focus-toolbar"><div><button onClick={() => { if (stageRef.current) void stageRef.current.requestFullscreen().catch(() => setNotice("全画面表示を開始できませんでした。")); }} className="focus-tool"><span aria-hidden>⛶</span>全画面表示</button><button onClick={() => setSettingsOpen(value => !value)} aria-expanded={settingsOpen} className="focus-tool"><span aria-hidden>⚙</span>接続設定</button></div><div><span className="focus-status-pill"><FocusMark /><span>Focus</span></span><button className="focus-leave" disabled={focus.busy} onClick={() => void focus.change({ action: "close" })}>サポート終了</button></div></footer>
  </div>
    {settingsOpen && <aside className="focus-support focus-detail-panel" aria-label="Focus設定"><header className="focus-support-header"><span><FocusMark /><strong>Focus設定</strong></span><button onClick={() => setSettingsOpen(false)} aria-label="設定を閉じる">×</button></header><div className="focus-settings">
      <section><h2>カメラ背景のデモ</h2><p>自動判定ではなく、表示確認用の切り替えです。接続済みのRecallカメラにも反映されます。</p><div className="focus-demo-options">{(Object.keys(cameraDemos) as CameraDemoMode[]).map(mode => <button key={mode} type="button" className="focus-button" aria-pressed={(session.cameraDemoMode ?? "on-track") === mode} disabled={focus.busy} onClick={() => void focus.change({ action: "cameraDemo", mode })}>{cameraDemos[mode].label}</button>)}</div></section>
      <section><h2>アジェンダ連携</h2><p>Google MeetからPDF／DOCXのDriveリンクを受け取り、自動で読み込みます。</p><p role="status">{session.agendaImport?.state === "processing" ? "読み込み中…" : session.agendaImport?.state === "error" ? "読み込みに失敗しました。ファイルのアクセス権を確認してMeetから再送してください。" : session.agenda ? "アジェンダ取得済み" : "アジェンダ取得待ち"}</p></section>
      <section><h2>ボットのカメラ</h2><p>共有した提案だけを表示します。</p><a className="focus-button" href={focus.cameraPath ?? "#"} target="_blank" rel="noopener noreferrer">カメラ表示を開く ↗</a></section>
      <MeetChatConnection botId={session.recallBotId ?? null} busy={focus.busy} onBind={botId => focus.change({ action: "bindBot", botId })} onInfo={focus.chatInfo} />
      <form onSubmit={async event => { event.preventDefault(); const result = await focus.connectBot(botId); if (result) setNotice(result.message); }}><h2>Recallのボットに接続</h2><p>入室済みBotのカメラをFocus表示に切り替えます。</p><label htmlFor="recall-bot">Recall Bot ID</label><input id="recall-bot" required value={botId} onChange={event => setBotId(event.target.value)} placeholder="Bot ID（UUID）" /><button disabled={focus.busy} className="focus-button focus-primary">カメラ出力を開始</button></form>
      <form onSubmit={event => { event.preventDefault(); try { const url = new URL(videoUrl); if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error(); setSource({ kind: "url", url: url.href }); setNotice(""); } catch { setNotice("再生可能なHTTPSの映像URLを入力してください。"); } }}><h2>会議映像（任意）</h2><label htmlFor="meeting-video">配信・録画URL</label><input id="meeting-video" required value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="https://…/video.mp4" /><button className="focus-button">映像を表示</button>{source && <button type="button" className="focus-text-button" onClick={() => setSource(null)}>映像を閉じる</button>}</form>
    </div></aside>}
    {(focus.error || notice) && <div role="status" className={`focus-toast ${focus.error ? "focus-toast-error" : ""}`}>{focus.error || notice}<button onClick={() => { setNotice(""); focus.dismissError(); }} aria-label="通知を閉じる">×</button></div>}
  </main>;
}
