"use client";

import { useRef, useState } from "react";

type MaterialItem = { name: string; saved: boolean; message: string | null };

const MAX_SELECTED_FILES = 5;

export function JoinForm() {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileLimitNote, setFileLimitNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [materialNotes, setMaterialNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    if (!/^https:\/\/.+/i.test(meetingUrl)) {
      setError("会議 URL は https:// で始めてください。");
      return;
    }
    setPending(true);
    let sentId: string | null = null;
    try {
      const response = await fetch("/api/recall/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "入室に失敗しました");
        return;
      }
      sentId = body.id;
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
    setError(null);
    setNotice(null);
    setMaterialNotes([]);
    setPending(true);
    try {
      const response = await fetch("/api/recall/leave", { method: "POST" });
      const body = (await response.json()) as {
        left?: boolean;
        alreadyGone?: boolean;
        error?: string;
      };
      if (!response.ok || !body.left) {
        setError(body.error ?? "退出に失敗しました");
        return;
      }
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
                  disabled={pending}
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
            disabled={pending}
          >
            参加
          </button>
          <button
            className="w-fit rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
            type="button"
            disabled={pending}
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
    </main>
  );
}
