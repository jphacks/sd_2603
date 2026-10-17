"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraSource } from "@/lib/meeting/types";

export type CameraViewProps = {
  source: CameraSource | null;
  title?: string;
};

type PlaybackState = "waiting" | "loading" | "playing" | "blocked" | "ended" | "error";

export function CameraView({ source, title = "会議の映像" }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<PlaybackState>("waiting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    let active = true;
    const update = (state: PlaybackState) => { if (active) setPlayback(state); };
    const loading = () => update("loading");
    const playing = () => update("playing");
    const ended = () => update("ended");
    const error = () => update("error");
    const events = { loadstart: loading, waiting: loading, playing, ended, error };
    for (const [event, listener] of Object.entries(events)) video.addEventListener(event, listener);
    const trackEnded = () => {
      if (source.kind === "stream" && source.stream.getVideoTracks().every(track => track.readyState === "ended")) ended();
    };
    if (source.kind === "stream") {
      video.srcObject = source.stream;
      source.stream.addEventListener("inactive", ended);
      source.stream.getVideoTracks().forEach(track => track.addEventListener("ended", trackEnded));
      if (!source.stream.active || source.stream.getVideoTracks().length === 0) {
        queueMicrotask(() => update("error"));
      }
    } else {
      video.src = source.url;
      video.load();
    }
    void video.play().catch((cause: unknown) => {
      if (!active || (cause instanceof DOMException && cause.name === "AbortError")) return;
      update(cause instanceof DOMException && cause.name === "NotAllowedError" ? "blocked" : "error");
    });
    return () => {
      active = false;
      for (const [event, listener] of Object.entries(events)) video.removeEventListener(event, listener);
      if (source.kind === "stream") {
        source.stream.removeEventListener("inactive", ended);
        source.stream.getVideoTracks().forEach(track => track.removeEventListener("ended", trackEnded));
      }
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
      // MediaStream ownership stays with the caller; do not stop its tracks.
    };
  }, [source, attempt]);

  const state = source ? playback : "waiting";
  const labels: Record<PlaybackState, string> = {
    waiting: "映像の接続を待っています", loading: "映像に接続しています…",
    playing: "再生中", blocked: "再生ボタンを押して映像を開始してください",
    ended: "映像が終了しました", error: "映像を再生できません。URLの期限・接続・形式を確認してください。",
  };

  return <section aria-label={title} className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950">
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
      <h2 className="font-medium">{title}</h2>
      <span className="flex items-center gap-2 text-sm text-slate-300"><span className={`h-2 w-2 rounded-full ${state === "playing" ? "bg-emerald-400" : "bg-slate-500"}`} />{({ waiting: "未接続 / 待機", loading: "接続中", playing: "再生中", blocked: "再生待ち", ended: "終了", error: "接続エラー" } satisfies Record<PlaybackState, string>)[state]}</span>
    </div>
    <div className="relative aspect-video bg-black">
      <video ref={videoRef} aria-label={title} autoPlay playsInline muted controls={source?.kind === "url"} className="h-full w-full object-contain" />
      {state !== "playing" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-slate-950/85 p-6 text-center">
        <span aria-hidden className="text-4xl text-indigo-300">▣</span>
        <p role={state === "error" ? "alert" : "status"} className="max-w-md text-slate-300">{labels[state]}</p>
        {source && ["blocked", "ended", "error"].includes(state) && <button type="button" onClick={() => { setPlayback("loading"); setAttempt(value => value + 1); }} className="rounded-xl bg-indigo-500 px-5 py-3 font-medium hover:bg-indigo-400">{state === "blocked" ? "映像を再生" : "再接続"}</button>}
      </div>}
    </div>
    <p className="px-6 py-4 text-xs text-slate-400">音声はミュートで開始します。映像全体を元の比率で表示します。</p>
  </section>;
}
