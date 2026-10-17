"use client";

import { useRef, useState } from "react";
import type { CameraSource, ChatDraft } from "@/lib/meeting/types";
import { CameraView } from "./CameraView";
import { ChatPanel } from "./ChatPanel";
import { FocusCameraCard } from "@/components/focus/FocusCameraCard";
import { FocusMark } from "@/components/focus/FocusMark";
import { SupportPanel } from "@/components/focus/SupportPanel";
import { useFocusSession } from "@/components/focus/useFocusSession";

export function MeetingWorkspace() {
  const focus = useFocusSession();
  const [title, setTitle] = useState("プロダクト定例");
  const [controlKey, setControlKey] = useState("");
  const [panel, setPanel] = useState<"support" | "chat" | "settings" | null>("support");
  const [agenda, setAgenda] = useState("");
  const [proposalText, setProposalText] = useState("今の案を、一度まとめてみませんか");
  const [botId, setBotId] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<CameraSource | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const session = focus.session;
  const openChat = () => { setAgenda(session?.agenda ?? ""); setPanel("chat"); };

  async function send(draft: ChatDraft) {
    const imported = draft.attachments.map(file => `【${file.name}】\n${file.text}`).join("\n\n");
    const nextAgenda = imported ? [session?.agenda, imported].filter(Boolean).join("\n\n") : undefined;
    if (nextAgenda && nextAgenda.length > 20000) { setNotice("添付を含むアジェンダは20000文字以内にしてください。"); throw new Error("アジェンダが長すぎます。"); }
    const text = [draft.text, ...draft.attachments.map(file => `アジェンダ添付：${file.name}`)].filter(Boolean).join("\n");
    const saved = await focus.change({ action: "note", text, agenda: nextAgenda });
    if (!saved) throw new Error("メモを保存できませんでした。");
    if (nextAgenda) { setAgenda(saved.agenda); setNotice("添付ファイルをアジェンダに取り込みました。"); }
  }

  if (!session || session.closed) return <main className="focus-setup"><div className="focus-setup-card"><FocusMark large /><p className="focus-eyebrow">MEETING FACILITATOR</p><h1>{session?.closed ? "おつかれさまでした。" : "会話に、集中しよう。"}</h1><p>必要なときだけ、議論を前へ。<br />Focusの進行サポートを準備しましょう。</p><form onSubmit={async event => { event.preventDefault(); if (await focus.create(title, controlKey)) { setControlKey(""); setNotice(""); } }}><label htmlFor="meeting-title">会議名</label><input id="meeting-title" required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /><details><summary>公開環境の操作キー</summary><label htmlFor="control-key">操作キー</label><input id="control-key" type="password" autoComplete="off" value={controlKey} onChange={event => setControlKey(event.target.value)} /><small>公開環境のみ必要です。</small></details><button className="focus-button focus-primary" disabled={focus.busy}>{focus.busy ? "準備中…" : "会議を準備する →"}</button></form>{focus.error && <p role="alert" className="focus-error">{focus.error}</p>}</div></main>;

  return <main className="focus-workspace"><div className="focus-meeting">
    <header className="focus-meeting-header"><span aria-hidden>♧</span><h1>{session.title}</h1><button className="focus-dark-button" onClick={() => setPanel("settings")}>設定</button></header>
    <div ref={stageRef} className="focus-stage">{source && <div className="focus-video"><CameraView source={source} /></div>}<div className={source ? "focus-bot-tile focus-bot-small" : "focus-bot-tile"}><FocusCameraCard message={session.sharedMessage} />{!source && <span className="focus-preview-label">ボットのカメラプレビュー</span>}</div></div>
    <footer className="focus-toolbar"><div><button onClick={() => { if (stageRef.current) void stageRef.current.requestFullscreen().catch(() => setNotice("全画面表示を開始できませんでした。")); }} className="focus-tool"><span aria-hidden>⛶</span>全画面表示</button><button onClick={openChat} className="focus-tool"><span aria-hidden>▤</span>アジェンダ</button><button onClick={() => setPanel("settings")} className="focus-tool"><span aria-hidden>⚙</span>接続設定</button></div><div><button onClick={() => setPanel(panel === "support" ? null : "support")} className="focus-status-pill"><FocusMark /><span>Focus<small><i />待機中</small></span></button><button className="focus-leave" disabled={focus.busy} onClick={() => void focus.change({ action: "close" })}>サポート終了</button></div></footer>
  </div>
    {panel === "support" && <SupportPanel session={session} busy={focus.busy} onChange={focus.change} onChat={openChat} onClose={() => setPanel(null)} onJudge={async () => { const result = await focus.requestJudge(); if (result) setNotice(result.message); }} />}
    {panel === "chat" && <aside className="focus-support focus-detail-panel"><header className="focus-support-header"><span><FocusMark /><strong>議題とメモ</strong></span><button onClick={() => setPanel("support")} aria-label="進行サポートへ戻る">×</button></header><div className="focus-agenda-editor"><label htmlFor="agenda-text">アジェンダ</label><textarea id="agenda-text" rows={4} maxLength={20000} value={agenda} onChange={event => setAgenda(event.target.value)} placeholder="今日決めたいことを入力…" /><button disabled={focus.busy} className="focus-button" onClick={async () => { if (await focus.change({ action: "agenda", agenda })) setNotice("アジェンダを保存しました。"); }}>アジェンダを保存</button></div><div className="focus-chat"><ChatPanel messages={session.notes.map(note => ({ ...note, name: "あなた", sender: "self" as const }))} onSend={send} /></div></aside>}
    {panel === "settings" && <aside className="focus-support focus-detail-panel"><header className="focus-support-header"><span><FocusMark /><strong>接続と表示</strong></span><button onClick={() => setPanel("support")} aria-label="進行サポートへ戻る">×</button></header><div className="focus-settings">
      <section><h2>ボットのカメラ</h2><p>共有した提案だけを表示します。</p><a className="focus-button" href={focus.cameraPath ?? "#"} target="_blank" rel="noopener noreferrer">カメラ表示を開く ↗</a></section>
      <form onSubmit={async event => { event.preventDefault(); const result = await focus.connectBot(botId); if (result) setNotice(result.message); }}><h2>Recallのボットに接続</h2><p>入室済みBotのカメラをFocus表示に切り替えます。</p><label htmlFor="recall-bot">Recall Bot ID</label><input id="recall-bot" required value={botId} onChange={event => setBotId(event.target.value)} placeholder="Bot ID（UUID）" /><button disabled={focus.busy} className="focus-button focus-primary">カメラ出力を開始</button></form>
      <form onSubmit={async event => { event.preventDefault(); if (await focus.change({ action: "propose", message: proposalText })) setPanel("support"); }}><h2>提案の表示を試す</h2><label htmlFor="demo-proposal">手動の提案文</label><textarea id="demo-proposal" required maxLength={500} rows={3} value={proposalText} onChange={event => setProposalText(event.target.value)} /><button disabled={focus.busy} className="focus-button">提案を準備する</button></form>
      <form onSubmit={event => { event.preventDefault(); try { const url = new URL(videoUrl); if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error(); setSource({ kind: "url", url: url.href }); setNotice(""); } catch { setNotice("再生可能なHTTPSの映像URLを入力してください。"); } }}><h2>会議映像（任意）</h2><label htmlFor="meeting-video">配信・録画URL</label><input id="meeting-video" required value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="https://…/video.mp4" /><button className="focus-button">映像を表示</button>{source && <button type="button" className="focus-text-button" onClick={() => setSource(null)}>映像を閉じる</button>}</form>
    </div></aside>}
    {(focus.error || notice) && <div role="status" className={`focus-toast ${focus.error ? "focus-toast-error" : ""}`}>{focus.error || notice}<button onClick={() => { setNotice(""); focus.dismissError(); }} aria-label="通知を閉じる">×</button></div>}
  </main>;
}
