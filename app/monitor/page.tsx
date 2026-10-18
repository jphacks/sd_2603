import { Suspense } from "react";
import Link from "next/link";
import { MonitorConnection } from "@/components/score-monitor/MonitorConnection";

async function ConnectedMonitor({ searchParams }: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  if (session && !/^[A-Za-z0-9_-]{1,128}$/.test(session))
    return <p>MTG IDが正しくありません。</p>;
  const sessionId = session || undefined;
  return (
    <main style={{ minHeight: "100vh", background: "#090f13", padding: "24px 12px", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 560, color: "#dce8ef" }}>
        <form action="/monitor" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4, flex: "1 1 240px", fontSize: 13 }}>
            MTG ID（参加後に表示されるBot ID）
            <input name="session" defaultValue={sessionId ?? ""} pattern="[A-Za-z0-9_-]{1,128}" maxLength={128}
              placeholder="空欄なら参加中の会議を自動表示"
              style={{ background: "#12202a", color: "#dce8ef", border: "1px solid #38505e", borderRadius: 6, padding: 8, minWidth: 0 }} />
          </label>
          <button type="submit" style={{ alignSelf: "end", border: "1px solid #38505e", borderRadius: 6, padding: 8 }}>表示する</button>
        </form>
        <p style={{ fontSize: 13, marginBottom: 20 }}>
          <Link href="/">会議へ参加する</Link>
          {sessionId && <> · <Link href="/monitor">参加中の会議を自動表示</Link></>}
        </p>
        <MonitorConnection key={sessionId ?? "auto"} sessionId={sessionId} />
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
