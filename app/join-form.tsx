"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeGoogleMeetUrl } from "@/lib/recall/meeting-url";
import Link from "next/link";
import { joinMeeting, leaveMeeting, listMeetings } from "./meeting-actions";
import { MonitorConnection } from "@/components/score-monitor/MonitorConnection";
import { AudioPipelineStatus } from "@/components/score-monitor/AudioPipelineStatus";

type MeetingItem = { id: string; meetingUrl: string; status: string };

type MaterialItem = { name: string; saved: boolean; message: string | null };

const MAX_SELECTED_FILES = 5;

export function JoinForm({ serverManagedControl = false, setupError = null }: { serverManagedControl?: boolean; setupError?: string | null }) {
  const [monitorSessionId, setMonitorSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(!serverManagedControl);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [agenda, setAgenda] = useState("");
  const [controlToken, setControlToken] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileLimitNote, setFileLimitNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [materialNotes, setMaterialNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!serverManagedControl) return;
    let cancelled = false;
    void listMeetings().then(result => {
      if (cancelled) return;
      if (result.ok) {
        setMeetings(result.data.meetings);
        if (result.data.meetings[0]) setMonitorSessionId(result.data.meetings[0].id);
      }
      else setListError(result.data.error ?? "参加状況を取得できませんでした。");
    }).catch(() => { if (!cancelled) setListError("参加状況を取得できませんでした。"); }).finally(() => { if (!cancelled) setSessionReady(true); });
    return () => { cancelled = true; };
  }, [serverManagedControl]);

  async function refreshMeetings() {
    setListError(null);
    try {
      const response = serverManagedControl
        ? await listMeetings().then(result => ({ ok: result.ok, json: async () => result.data }))
        : await fetch("/api/recall/meetings", { method: "POST", headers: { Authorization: `Bearer ${controlToken.trim()}` } });
      const body = await response.json() as { meetings?: MeetingItem[]; error?: string };
      if (!response.ok) { setListError(body.error ?? "参加状況を取得できませんでした。"); return; }
      setMeetings(body.meetings ?? []);
      setMonitorSessionId(body.meetings?.[0]?.id ?? null);
    } catch { setListError("参加状況を取得できませんでした。"); }
  }

  function replaceFiles(next: File[], limitNote: string | null) {
    setFiles(next);
    setFileLimitNote(limitNote);
    const input = fileInputRef.current;
    if (!input) return;
    const data = new DataTransfer();
    for (const file of next) data.items.add(file);
    input.files = data.files;
  }

  function removeFile(index: number) {
    replaceFiles(files.filter((_, itemIndex) => itemIndex !== index), null);
  }

  async function join() {
    setError(null);
    setNotice(null);
    setMaterialNotes([]);
    const normalizedMeetingUrl = normalizeGoogleMeetUrl(meetingUrl);
    if (!normalizedMeetingUrl) {
      setError("Google Meet のURLを確認してください（例: https://meet.google.com/abc-defg-hij）。");
      return;
    }
    setPending(true);
    let sentId: string | null = null;
    try {
      const response = serverManagedControl ? await joinMeeting(normalizedMeetingUrl, agenda).then(result => ({ ok: result.ok, json: async () => result.data })) : await fetch("/api/recall/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${controlToken.trim()}` },
        body: JSON.stringify({ meetingUrl: normalizedMeetingUrl, agenda }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "入室に失敗しました");
        return;
      }
      sentId = body.id;
      setMonitorSessionId(body.id);
      setMeetings(previous => [...previous.filter(item => item.id !== body.id), { id: body.id!, meetingUrl: normalizedMeetingUrl, status: "joining_call" }]);
      if (files.length === 0) {
        setNotice(`ボットを送信しました ${body.id}`);
        return;
      }
      const formData = new FormData();
      formData.set("botId", body.id);
      for (const file of files) formData.append("files", file);
      const materials = await fetch("/api/recall/materials", { method: "POST", body: formData });
      const saved = (await materials.json()) as {
        saved?: number;
        items?: MaterialItem[];
        error?: string;
      };
      if (!materials.ok) {
        setNotice(`ボットを送信しました ${body.id}`);
        setError(saved.error ?? "議案書の保存に失敗しました");
        return;
      }
      const notes = (saved.items ?? [])
        .filter((item) => item.message)
        .map((item) => `${item.name}: ${item.message}`);
      setMaterialNotes(notes);
      setNotice(`ボットを送信しました ${body.id}。アジェンダを ${saved.saved ?? 0} 件保存しました。`);
    } catch {
      if (sentId) {
        setNotice(`ボットを送信しました ${sentId}`);
        setError("議案書の保存に失敗しました");
      } else {
        setError("入室に失敗しました");
      }
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    if (!monitorSessionId) { setError("退出する会議を選択してください。"); return; }
    const leavingId = monitorSessionId;
    setError(null);
    setNotice(null);
    setMaterialNotes([]);
    setPending(true);
    try {
      const response = serverManagedControl ? await leaveMeeting(leavingId).then(result => ({ ok: result.ok, json: async () => result.data })) : await fetch("/api/recall/leave", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${controlToken.trim()}` }, body: JSON.stringify({ botId: leavingId }) });
      const body = (await response.json()) as {
        left?: boolean;
        alreadyGone?: boolean;
        error?: string;
      };
      if (!response.ok || !body.left) {
        setError(body.error ?? "退出に失敗しました");
        return;
      }
      setMonitorSessionId(null);
      setMeetings(previous => previous.filter(item => item.id !== leavingId));
      setNotice(body.alreadyGone ? "すでに退出しています" : "退出しました");
    } catch {
      setError("退出に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-16">
      <header>
        <h1 className="text-2xl font-semibold">会議へ参加</h1>
        <p className="mt-2 text-sm text-zinc-600">
          会議 URL を渡すと、MTG Lab が録画せずに入室します。Meet の参加申請を許可してください。テキストの議案書も一緒に渡すと、そのファイルを読んでアジェンダにします。
        </p>
      </header>
      {setupError && <p role="alert" className="text-sm text-rose-700">{setupError}</p>}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void join();
        }}
      >
        <label className="grid gap-1 text-sm">
          会議 URL
          <input
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
            value={meetingUrl}
            placeholder="https://meet.google.com/abc-defg-hij"
            onChange={(event) => setMeetingUrl(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          アジェンダ（音声モードで必須）
          <input
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
            value={agenda}
            maxLength={500}
            onChange={(event) => setAgenda(event.target.value)}
          />
        </label>
        <p className="text-xs text-zinc-600">
          最初は上のアジェンダを使い、議案書やMeetチャットから取り込んだアジェンダも次の音声判定に反映します。更新中は介入を保留します。
        </p>
        {serverManagedControl ? (
          <p className="text-xs text-zinc-600">入退室にはサーバーに設定済みの認証情報を使用します。操作トークンの入力は不要です。</p>
        ) : (
          <>
        <label className="grid gap-1 text-sm">
          操作トークン
          <input
            type="password"
            autoComplete="off"
            required
            minLength={32}
            aria-describedby="control-token-help"
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
            value={controlToken}
            onChange={(event) => setControlToken(event.target.value)}
          />
        </label>
            <p id="control-token-help" className="text-xs text-zinc-600">VercelのRECALL_CONTROL_TOKENと同じ32文字以上の値を入力してください。</p>
          </>
        )}
        <label className="grid gap-1 text-sm">
          議案書ファイル（任意、.txt / .md、最大5件）
          <input
            ref={fileInputRef}
            className="text-sm"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            multiple
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              replaceFiles(
                selected.slice(0, MAX_SELECTED_FILES),
                selected.length > MAX_SELECTED_FILES ? "6件目以降は使いません。" : null,
              );
            }}
          />
        </label>
        {files.length > 0 ? (
          <ul className="grid gap-1 text-sm text-zinc-800">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{file.name}</span>
                <button
                  className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
                  type="button"
                  disabled={pending || Boolean(setupError)}
                  onClick={() => removeFile(index)}
                >
                  取り消す
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {fileLimitNote ? <p className="text-sm text-zinc-600">{fileLimitNote}</p> : null}
        <div className="flex gap-2">
          <button
            className="w-fit rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            type="submit"
            disabled={!sessionReady || pending || monitorSessionId !== null || Boolean(setupError)}
          >
            参加
          </button>
          <button
            className="w-fit rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
            type="button"
            disabled={pending || monitorSessionId === null || Boolean(setupError)}
            onClick={() => {
              void leave();
            }}
          >
            退出
          </button>
        </div>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {notice ? <p className="text-sm text-zinc-800">{notice}</p> : null}
        {materialNotes.length > 0 ? (
          <ul className="grid gap-1 text-sm text-rose-700">
            {materialNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        ) : null}
      </form>
      <section aria-label="自分の参加状況" className="grid gap-3">
        <button type="button" className="w-fit text-sm underline" disabled={pending} onClick={() => void refreshMeetings()}>参加状況を確認</button>
        {listError && <p role="alert" className="text-sm text-rose-700">{listError}</p>}
        {meetings[0] && <p className="break-all text-sm">参加中: {meetings[0].meetingUrl}</p>}
        <p className="text-xs text-zinc-600">このブラウザから参加させた会議だけを表示・操作します。再読み込み後も参加状況を復元します。</p>
      </section>
      {monitorSessionId && (
        <section aria-label="この会議のJev判定" className="rounded-xl bg-[#090f13] p-4">
          <AudioPipelineStatus key={`audio-${monitorSessionId}`} botId={monitorSessionId} />
          <Link className="mb-4 block text-sm text-sky-200 underline" href={`/monitor?session=${encodeURIComponent(monitorSessionId)}`} target="_blank" rel="noopener noreferrer">
            この会議の判定グラフを別画面で開く
          </Link>
          <MonitorConnection key={monitorSessionId} sessionId={monitorSessionId} />
        </section>
      )}
    </main>
  );
}
