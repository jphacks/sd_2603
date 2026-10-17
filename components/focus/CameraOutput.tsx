"use client";

import { useEffect, useState } from "react";
import type { FocusCameraState } from "@/lib/focus/types";
import { FocusCameraCard } from "./FocusCameraCard";

export function CameraOutput({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<FocusCameraState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    let active = true;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (!token) throw new Error("表示用リンクが必要です。操作パネルからカメラ表示を開いてください。");
        const response = await fetch(`/api/focus/sessions/${sessionId}?view=camera`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "接続できませんでした。");
        if (active) { setState(data); setConnected(true); setError(""); }
      } catch (cause) {
        if (active) { setConnected(false); setState(null); setError(cause instanceof Error ? cause.message : "接続できませんでした。"); }
      } finally { if (active && token) timer = setTimeout(poll, 1000); }
    }
    void poll();
    return () => { active = false; abort.abort(); clearTimeout(timer); };
  }, [sessionId]);

  return <main className="focus-output"><FocusCameraCard message={state?.sharedMessage ?? null} closed={state?.closed} connected={connected} />{error && <p role="status" className="focus-output-error">{error}</p>}</main>;
}
