"use client";

import { useState } from "react";

export function JoinForm() {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function join() {
    setError(null);
    setNotice(null);
    if (!/^https:\/\/.+/i.test(meetingUrl)) {
      setError("会議 URL は https:// で始めてください。");
      return;
    }
    setPending(true);
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
      setNotice(`ボットを送信しました ${body.id}`);
    } catch {
      setError("入室に失敗しました");
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    setError(null);
    setNotice(null);
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
          会議 URL を渡すと、MTG Lab が録画せずに入室します。Meet の参加申請を許可してください。
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
      </form>
    </main>
  );
}
