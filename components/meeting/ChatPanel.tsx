"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { AgendaAttachment, ChatDraft, ChatMessage } from "@/lib/meeting/types";

export type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (draft: ChatDraft) => void | Promise<void>;
};

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const MAX_TEXT_LENGTH = 4000;
const bubbleStyles = {
  self: "ml-8 bg-indigo-500 text-white",
  bot: "mr-8 border border-indigo-400/30 bg-indigo-400/10 text-indigo-100",
  participant: "mr-8 bg-slate-800 text-slate-100",
};

export function ChatPanel({ messages, onSend }: ChatPanelProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<AgendaAttachment[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [reading, setReading] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const history = historyRef.current;
    history?.scrollTo({ top: history.scrollHeight, behavior: "auto" });
  }, [messages]);

  async function attach(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    if (files.length + attachments.length > MAX_ATTACHMENTS) { setError("添付できるファイルは3件までです。"); return; }
    if (files.some(file => !/\.(txt|md|csv)$/i.test(file.name) || file.size > MAX_FILE_BYTES || file.size === 0)) {
      setError("1MB以下の空でない .txt / .md / .csv ファイルを選んでください。"); return;
    }
    setReading(true);
    try {
      const next = await Promise.all(files.map(async file => ({ id: crypto.randomUUID(), name: file.name, size: file.size, text: await file.text() })));
      if (next.some(file => file.text.includes("\u0000") || file.text.includes("\uFFFD"))) throw new Error("文字コードをUTF-8にして再添付してください。");
      setAttachments(current => [...current, ...next]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ファイルを読み込めませんでした。"); }
    finally { setReading(false); }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (sending || reading || (!text.trim() && attachments.length === 0)) return;
    setSending(true); setError("");
    try {
      await onSend({ text: text.trim(), attachments });
      setText(""); setAttachments([]);
    } catch { setError("送信できませんでした。内容を保持しています。もう一度お試しください。"); }
    finally { setSending(false); }
  }

  return <section aria-labelledby="chat-heading" className="flex h-[680px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 lg:h-full lg:min-h-[600px] lg:max-h-[850px]">
    <header className="border-b border-slate-700 px-5 py-5"><h2 id="chat-heading" className="font-semibold">会議チャット</h2><p className="mt-1 text-xs text-slate-400">この画面内の履歴 · 再読み込みで消去</p></header>
    <div ref={historyRef} role="log" aria-label="メッセージ履歴" aria-live="polite" aria-relevant="additions" tabIndex={0} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5">
      {messages.length === 0 && <p className="py-12 text-center text-sm text-slate-400">議題や会議のURLを共有しましょう。</p>}
      {messages.map(message => <article key={message.id} className={`rounded-2xl p-4 ${bubbleStyles[message.sender]}`}>
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs opacity-75"><span>{message.name} · {message.sender === "self" ? "自分" : message.sender === "bot" ? "ボット" : "相手"}</span><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</time></div>
        {message.text && <p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{message.text}</p>}
        {message.attachments?.map(file => <details key={file.id} className="mt-3 rounded-xl border border-white/20 p-3 text-sm"><summary className="cursor-pointer break-all">▤ {file.name} · {Math.ceil(file.size / 1024)} KB</summary><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words font-sans text-xs">{file.text}</pre></details>)}
      </article>)}
    </div>
    <form onSubmit={submit} className="space-y-3 border-t border-slate-700 p-4">
      {attachments.map(file => <div key={file.id} className="flex items-center gap-2 rounded-lg bg-slate-800 p-2 text-xs"><span className="min-w-0 flex-1 truncate">▤ {file.name}</span><button type="button" disabled={sending} aria-label={`${file.name}を削除`} onClick={() => setAttachments(current => current.filter(item => item.id !== file.id))} className="rounded p-2 hover:bg-slate-700">×</button></div>)}
      <label htmlFor="chat-message" className="sr-only">メッセージ</label>
      <textarea id="chat-message" value={text} disabled={sending} maxLength={MAX_TEXT_LENGTH} onChange={event => setText(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void submit(); }
      }} rows={3} placeholder="メッセージを入力…" className="w-full resize-y rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-300" />
      <input ref={fileRef} type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" multiple onChange={attach} className="sr-only" tabIndex={-1} />
      <div className="flex items-center justify-between gap-3"><button type="button" disabled={sending || reading || attachments.length >= MAX_ATTACHMENTS} onClick={() => fileRef.current?.click()} className="rounded-xl border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-40">{reading ? "読み込み中…" : "＋ アジェンダ添付"}</button><button type="submit" disabled={sending || reading || (!text.trim() && !attachments.length)} className="rounded-xl bg-indigo-500 px-5 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-40">{sending ? "送信中…" : "送信 →"}</button></div>
      <p className="text-[11px] leading-5 text-slate-400">Enterで送信 / Shift+Enterで改行<br />添付：UTF-8のTXT・MD・CSV、各1MBまで</p>
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
    </form>
  </section>;
}
