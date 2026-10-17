"use client";
import { useEffect, useState } from "react";
import { acceptEnvelope, EnvelopeSchema } from "../../lib/monitor/schema";
import type { Envelope } from "../../lib/monitor/schema";
import { ScoreMonitor } from "./ScoreMonitor";
import type { Connection } from "./ScoreMonitor";

export function MonitorConnection({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<Envelope | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function tick() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const response = await fetch(
            `/api/monitor/${encodeURIComponent(sessionId)}`,
            { cache: "no-store", signal: abort.signal },
          );
          if (!response.ok) throw new Error("Monitor unavailable");
          const incoming: unknown = await response.json();
          const parsed = EnvelopeSchema.safeParse(incoming);
          if (
            !parsed.success ||
            (parsed.data.snapshot &&
              parsed.data.snapshot.sessionId !== sessionId)
          )
            setConnection("invalid");
          else {
            setData((previous) =>
              acceptEnvelope(previous, parsed.data, sessionId),
            );
            setConnection("connected");
          }
        } catch {
          if (!stopped) setConnection("disconnected");
        }
      }
      if (!stopped) timer = setTimeout(tick, 2000);
    }
    void tick();
    return () => {
      stopped = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [sessionId]);
  return <ScoreMonitor envelope={data} connection={connection} />;
}
