"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { readConfig, readSession, configKey, sessionKey, type MeetingConfig, type MeetingSession } from "@/lib/meeting/session";

type SessionContext = {
  ready: boolean;
  session: MeetingSession | null;
  config: MeetingConfig | null;
  saveSession: (s: MeetingSession) => void;
  saveConfig: (c: MeetingConfig) => void;
  storageError: boolean;
};
const Context = createContext<SessionContext | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; session: MeetingSession | null; config: MeetingConfig | null }>({ ready: false, session: null, config: null });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    // Read browser storage after hydration, never during server rendering.
    const id = window.setTimeout(() => setState({ ready: true, session: readSession(), config: readConfig() }), 0);
    return () => window.clearTimeout(id);
  }, []);
  function persist(key: string, value: unknown) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); }
    catch { setStorageError(true); }
  }
  return <Context.Provider value={{ ...state, storageError,
    saveSession: s => { setState(prev => ({ ...prev, session: s })); persist(sessionKey, s); },
    saveConfig: c => { setState(prev => ({ ...prev, config: c })); persist(configKey, c); },
  }}>{children}</Context.Provider>;
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider is required");
  return value;
}
