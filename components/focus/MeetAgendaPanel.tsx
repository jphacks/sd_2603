"use client";

import { useEffect, useRef, useState } from "react";
import type { FocusSession } from "@/lib/focus/types";
import { FocusMark } from "./FocusMark";

type Props = {
  session: FocusSession;
  busy: boolean;
  onClose: () => void;
  onSave: (agenda: string) => Promise<FocusSession | null>;
  onImport: (messageId: string, link?: string) => Promise<{ session: FocusSession; message: string } | null>;
};

export function MeetAgendaPanel({ session, busy, onClose, onSave, onImport }: Props) {
  const [draft, setDraft] = useState(session.agenda);
  const [notice, setNotice] = useState("");
  const received = session.meetChat ?? [];
  const latest = received.at(-1)?.id;
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [latest]);
  async function take(messageId: string, link?: string) {
    const result = await onImport(messageId, link);
    if (result) { setDraft(result.session.agenda); setNotice(result.message); }
  }
  return <aside className="focus-support focus-detail-panel">
    <header className="focus-support-header"><span><FocusMark /><strong>会議のアジェンダ</strong></span><button onClick={onClose} aria-label="進行サポートへ戻る">×</button></header>
    <div className="focus-agenda-editor"><label htmlFor="agenda-text">現在のアジェンダ</label><textarea id="agenda-text" rows={7} maxLength={20000} value={draft} onChange={event => setDraft(event.target.value)} /><button disabled={busy} className="focus-button" onClick={async () => { if (await onSave(draft)) setNotice("アジェンダを保存しました。"); }}>編集内容を保存</button>{notice && <p role="status">{notice}</p>}</div>
    <section className="focus-meet-inbox" aria-label="Google Meetから受信したチャット">
      <h2>Meetチャットから受信</h2><p className="focus-inbox-help">Google Meetのチャット欄から、PDF／DOCXのDrive共有リンクを送信してください。受信後にファイルを選んで取り込みます。</p>
      {!received.length && <p className="focus-inbox-empty">まだ受信していません。接続設定でWebhook URLと受信Bot IDを確認してください。</p>}
      <div role="log" aria-live="polite" aria-relevant="additions" className="focus-inbox-messages">{received.map(message => <article key={message.id}><header><strong>{message.sender}</strong><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</time></header><p>{message.text}</p><button className="focus-text-button" disabled={busy} onClick={() => void take(message.id)}>本文をアジェンダに取り込む</button>{message.links.map(link => <div className="focus-inbox-file" key={link}><a href={link} target="_blank" rel="noopener noreferrer">ファイルリンクを開く ↗</a><button className="focus-button" disabled={busy} onClick={() => void take(message.id, link)}>PDF／DOCXを取り込む</button></div>)}</article>)}</div>
      <div ref={bottom} />
    </section>
  </aside>;
}
