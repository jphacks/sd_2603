"use client";

import { useState } from "react";
import type { FocusAction, FocusSession } from "@/lib/focus/types";
import { FocusMark } from "./FocusMark";

type Props = {
  session: FocusSession;
  busy: boolean;
  onChange: (action: FocusAction) => Promise<FocusSession | null>;
  onClose: () => void;
  onJudge: () => void;
};

export function SupportPanel({ session, busy, onChange, onClose, onJudge }: Props) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const pending = session.proposal?.state === "pending" ? session.proposal : null;
  return <aside className="focus-support" aria-label="Focus進行サポート">
    <header className="focus-support-header"><span><FocusMark /><strong>Focus</strong></span><button onClick={onClose} aria-label="進行サポートを閉じる">×</button></header>
    <div className="focus-support-body"><h2>進行サポート</h2><p className="focus-watching"><i />提案を確認できます</p>
      <p className="focus-inbox-help" role="status">アジェンダ：{session.agendaImport?.state === "processing" ? "読み込み中" : session.agendaImport?.state === "error" ? "読み込み失敗。Meetのリンクとアクセス権を確認してください。" : session.agenda ? "Google Meetから取得済み" : "Google Meetからの取得待ち"}</p>
      <div className="focus-suggestion-area">{pending ? <>
        <article className="focus-suggestion" aria-live="polite"><span className="focus-lightbulb" aria-hidden>☀</span><p>{pending.message}</p></article>
        <p className="focus-private">♙ 自分だけに表示</p>
        <div className="focus-suggestion-actions"><button disabled={busy} className="focus-button" onClick={() => void onChange({ action: "defer", proposalId: pending.id })}>あとで</button><button disabled={busy} className="focus-button focus-primary" onClick={() => void onChange({ action: "share", proposalId: pending.id })}>会議に共有</button></div>
      </> : <div className="focus-empty-suggestion"><FocusMark large /><p>{session.sharedMessage ? "会議に提案を表示しています" : "必要な一言を、必要なときに。"}</p><span>{session.proposal?.state === "deferred" ? "提案を保留しました。メモから再確認できます。" : "提案は確認してから会議に共有できます。"}</span></div>}
      {session.sharedMessage && <button className="focus-clear" disabled={busy} onClick={() => void onChange({ action: "clear" })}>カメラの提案を閉じる</button>}</div>
      <div className="focus-manual"><button className="focus-text-button" disabled={busy || Boolean(pending)} onClick={onJudge}>メモをもとに判定する</button><br /><button className="focus-text-button" onClick={() => setEditing(value => !value)} aria-expanded={editing}>＋ 提案を入力する</button>{editing && <form onSubmit={async event => { event.preventDefault(); if (await onChange({ action: "propose", message: draft })) { setDraft(""); setEditing(false); } }}><label htmlFor="proposal-draft" className="sr-only">提案文</label><textarea id="proposal-draft" placeholder="今の案を、一度まとめてみませんか" maxLength={500} value={draft} onChange={event => setDraft(event.target.value)} required rows={3} /><button disabled={busy || !draft.trim()} className="focus-button">提案を準備</button><p>手動の提案です。共有するまで会議には表示されません。</p></form>}</div>
      <div className="focus-notes"><button className="focus-notes-toggle" onClick={() => setShowNotes(value => !value)} aria-expanded={showNotes}><span>▤　メモ {session.notes.length}件</span><span>{showNotes ? "⌃" : "⌄"}</span></button>{showNotes && <div className="focus-notes-content">{session.notes.length ? session.notes.map(note => <p key={note.id}>{note.text}</p>) : <p>保存されたメモはありません。</p>}{session.proposal?.state === "deferred" && <div className="focus-deferred"><p>保留中：{session.proposal.message}</p><button disabled={busy} className="focus-text-button" onClick={() => void onChange({ action: "propose", message: session.proposal!.message })}>もう一度提案する</button></div>}</div>}</div>
    </div>
  </aside>;
}
