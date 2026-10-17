"use client";

import { useEffect, useState } from "react";

type Line = {
  speaker: string;
  text: string;
  start: number | null;
};

type Judgment = {
  action: "SILENCE" | "WAIT" | "INTERVENE";
  reason: string;
  message: string | null;
};

const STAGE: Record<Judgment["action"], { title: string; className: string }> = {
  SILENCE: {
    title: "見守っています",
    className: "bg-zinc-900 text-zinc-100",
  },
  WAIT: {
    title: "話を聞いています",
    className: "bg-amber-50 text-amber-950",
  },
  INTERVENE: {
    title: "声をかけます",
    className: "bg-rose-600 text-white",
  },
};

function statusLabel(code: string | null) {
  if (code === "in_waiting_room") return "Meet で MTG Lab の参加を許可してください";
  if (code === "joining_call") return "入室しています";
  if (code === "in_call_not_recording" || code === "in_call_recording") return "会議にいます";
  if (code === "call_ended" || code === "done") return "退出しました";
  if (code === "fatal") return "入室に失敗しました";
  return "まだ入室していません";
}

export function MeetingRoom() {
  const [agenda, setAgenda] = useState("会議の議題");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [botId, setBotId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [judgment, setJudgment] = useState<Judgment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!botId) return;
    let cancelled = false;

    async function tick() {
      const [statusResponse, meetingResponse] = await Promise.all([
        fetch(`/api/recall/bots/${botId}`),
        fetch(`/api/recall/bots/${botId}/meeting`),
      ]);
      if (cancelled) return;
      if (statusResponse.ok) {
        const status = (await statusResponse.json()) as { code: string | null };
        setCode(status.code);
      }
      if (meetingResponse.ok) {
        const meeting = (await meetingResponse.json()) as {
          lines: Line[];
          judgment: Judgment | null;
        };
        setLines(meeting.lines ?? []);
        setJudgment(meeting.judgment);
      }
    }

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [botId]);

  async function join() {
    setError(null);
    if (!/^https:\/\/.+/i.test(meetingUrl)) {
      setError("会議 URL は https:// で始めてください。");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/recall/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl, agenda }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "入室に失敗しました");
        return;
      }
      setBotId(body.id);
      setCode("joining_call");
      setJudgment(null);
      setLines([]);
    } catch {
      setError("入室に失敗しました");
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    if (!botId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/recall/bots/${botId}/leave`, { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "退出に失敗しました");
        return;
      }
      setBotId(null);
      setCode("call_ended");
    } catch {
      setError("退出に失敗しました");
    } finally {
      setPending(false);
    }
  }

  const inCall = code === "in_call_not_recording" || code === "in_call_recording";
  const action = inCall ? (judgment?.action ?? "WAIT") : null;
  const stage = action ? STAGE[action] : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">会議ファシリテーター</h1>
        <p className="mt-1 text-sm text-zinc-600">{statusLabel(code)}</p>
      </header>

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void join();
        }}
      >
        <label className="grid gap-1 text-sm">
          アジェンダ
          <textarea
            className="min-h-20 rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
            value={agenda}
            disabled={botId !== null}
            onChange={(event) => setAgenda(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          会議 URL
          <input
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
            value={meetingUrl}
            placeholder="https://meet.google.com/abc-defg-hij"
            disabled={botId !== null}
            onChange={(event) => setMeetingUrl(event.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            type="submit"
            disabled={pending || botId !== null}
          >
            入室
          </button>
          <button
            className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
            type="button"
            disabled={pending || botId === null}
            onClick={() => {
              void leave();
            }}
          >
            退出
          </button>
        </div>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </form>

      <section
        className={`flex min-h-48 flex-col justify-center rounded-2xl px-6 py-8 ${stage?.className ?? "bg-zinc-100 text-zinc-800"}`}
        aria-live="polite"
      >
        <p className="text-3xl font-semibold">{stage?.title ?? statusLabel(code)}</p>
        {action === "INTERVENE" && judgment?.message ? (
          <p className="mt-3 text-xl">{judgment.message}</p>
        ) : null}
        {inCall && judgment?.reason ? (
          <p className="mt-4 text-sm opacity-80">{judgment.reason}</p>
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-medium">文字起こし</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">まだ発話はありません</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {lines.map((line) => (
              <li key={`${line.start ?? "x"}-${line.speaker}-${line.text}`} className="text-sm">
                <span className="font-medium">{line.speaker}</span>
                <span className="ml-2">{line.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
