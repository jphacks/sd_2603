import { Suspense } from "react";
import Link from "next/link";
import { parseMeetingSelection } from "@/lib/monitor/meeting";
import { MonitorConnection } from "@/components/score-monitor/MonitorConnection";

async function ConnectedMonitor({ searchParams }: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  const selected = session?.trim() ? parseMeetingSelection(session) : null;
  const invalid = Boolean(session?.trim() && !selected);
  const sessionId = selected?.kind === "session" ? selected.value : undefined;
  const meetingUrl = selected?.kind === "meeting" ? selected.value : undefined;
  return (
    <main style={{ minHeight: "100vh", background: "#090f13", padding: "24px 12px", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 560, color: "#dce8ef" }}>
        <form action="/monitor" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4, flex: "1 1 240px", fontSize: 13 }}>
            会議URL・Meetコード・Bot ID
            <input name="session" defaultValue={session ?? ""} maxLength={2048}
              placeholder="https://meet.google.com/abc-defg-hij"
              style={{ background: "#12202a", color: "#dce8ef", border: "1px solid #38505e", borderRadius: 6, padding: 8, minWidth: 0 }} />
          </label>
          <button type="submit" style={{ alignSelf: "end", border: "1px solid #38505e", borderRadius: 6, padding: 8 }}>表示する</button>
        </form>
        <p style={{ fontSize: 13, marginBottom: 20 }}>
          <Link href="/">会議へ参加する</Link>
          {selected && <> · <Link href="/monitor">参加中の会議を自動表示</Link></>}
        </p>
        {invalid ? (
          <p role="alert">Google Meetの会議URL、会議コード（例: abc-defg-hij）、または参加後のBot IDを入力してください。</p>
        ) : (
          <MonitorConnection key={sessionId ?? meetingUrl ?? "auto"} sessionId={sessionId} meetingUrl={meetingUrl} />
        )}
      </div>
    </main>
  );
}

export default function MonitorPage(props: { searchParams: Promise<{ session?: string }> }) {
  return (
    <Suspense fallback={<p>モニターに接続しています…</p>}>
      <ConnectedMonitor {...props} />
    </Suspense>
  );
}
