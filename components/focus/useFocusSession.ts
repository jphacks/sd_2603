"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusAction, FocusCredentials, FocusSession } from "@/lib/focus/types";

const storageKey = "focus-control-session-v1";
async function json(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "処理に失敗しました。");
  return data;
}

export function useFocusSession() {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [credentials, setCredentials] = useState<FocusCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const current = useRef<FocusSession | null>(null);
  const mounted = useRef(true);
  const accept = useCallback((value: FocusSession) => {
    if (!current.current || current.current.id !== value.id || value.revision >= current.current.revision) {
      current.current = value;
      if (mounted.current) setSession(value);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(async () => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as FocusCredentials;
        if (!saved.id || !saved.controlToken || !saved.cameraToken) return;
        const data = await json(await fetch(`/api/focus/sessions/${saved.id}`, { headers: { Authorization: `Bearer ${saved.controlToken}` }, cache: "no-store" }));
        if (mounted.current) { setCredentials(saved); accept(data); }
      } catch { if (mounted.current) setError("前の会議を復元できませんでした。新しい会議を作成してください。"); }
    });
    return () => { mounted.current = false; };
  }, [accept]);

  useEffect(() => {
    if (!credentials) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function refresh() {
      try {
        const data = await json(await fetch(`/api/focus/sessions/${credentials!.id}`, { headers: { Authorization: `Bearer ${credentials!.controlToken}` }, cache: "no-store", signal: abort.signal }));
        if (active) accept(data);
      } catch { /* Keep unsent edits when polling fails. */ }
      finally { if (active) timer = setTimeout(refresh, 2000); }
    }
    timer = setTimeout(refresh, 2000);
    return () => { active = false; clearTimeout(timer); abort.abort(); };
  }, [credentials, accept]);

  async function run<T>(operation: () => Promise<T>): Promise<T | null> {
    if (inFlight.current) return null;
    inFlight.current = true; setBusy(true); setError("");
    try { return await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "処理に失敗しました。"); return null; }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function create(title: string, controlKey: string) {
    return run(async () => {
      const data = await json(await fetch("/api/focus/sessions", { method: "POST", headers: { "Content-Type": "application/json", ...(controlKey ? { Authorization: `Bearer ${controlKey}` } : {}) }, body: JSON.stringify({ title }) })) as { session: FocusSession; credentials: FocusCredentials };
      setCredentials(data.credentials); accept(data.session);
      try { sessionStorage.setItem(storageKey, JSON.stringify(data.credentials)); }
      catch { setError("このタブへの一時保存ができません。再読み込みすると操作リンクが失われます。"); }
      return data.session;
    });
  }
  async function change(action: FocusAction) {
    if (!credentials || !current.current) return null;
    return run(async () => {
      const data = await json(await fetch(`/api/focus/sessions/${credentials.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${credentials.controlToken}` },
        body: JSON.stringify({ revision: current.current!.revision, change: action }),
      })) as FocusSession;
      accept(data); return data;
    });
  }
  async function connectBot(botId: string) {
    if (!credentials) return null;
    return run(async () => json(await fetch(`/api/focus/sessions/${credentials.id}/output`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${credentials.controlToken}` }, body: JSON.stringify({ botId, cameraToken: credentials.cameraToken }),
    })) as Promise<{ message: string }>);
  }
  async function requestJudge() {
    if (!credentials) return null;
    return run(async () => {
      const result = await json(await fetch(`/api/focus/sessions/${credentials.id}/judge`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${credentials.controlToken}` }, body: "{}",
      })) as { session: FocusSession; message: string };
      accept(result.session);
      return result;
    });
  }
  const cameraPath = credentials ? `/focus/camera/${credentials.id}#${new URLSearchParams({ token: credentials.cameraToken })}` : null;
  return { session, busy, error, dismissError: () => setError(""), create, change, connectBot, requestJudge, cameraPath };
}
