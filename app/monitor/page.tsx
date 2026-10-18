import { Suspense } from "react";
import Link from "next/link";
import { Noto_Sans_JP } from "next/font/google";
import { parseMeetingSelection } from "@/lib/monitor/meeting";
import { MonitorConnection } from "@/components/score-monitor/MonitorConnection";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700", "900"],
  preload: false,
});

async function ConnectedMonitor({ searchParams }: {
  searchParams: Promise<{ session?: string; demo?: string }>;
}) {
  const { session, demo: demoParam } = await searchParams;
  // 疑似データは開発時だけ。本番では ?demo=1 を付けても無視する。
  const demo = process.env.NODE_ENV !== "production" && demoParam === "1";
  const selected = session?.trim() ? parseMeetingSelection(session) : null;
  const invalid = Boolean(session?.trim() && !selected);
  const sessionId = selected?.kind === "session" ? selected.value : undefined;
  const meetingUrl = selected?.kind === "meeting" ? selected.value : undefined;
  return (
    <main className={notoSansJp.variable} style={{ minHeight: "100vh", background: "#fff", color: "#000", fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif", padding: "32px 16px", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <form action="/monitor" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 6, flex: "1 1 240px", fontSize: 12, fontWeight: 700 }}>
            会議URL・Meetコード・Bot ID
            <input name="session" defaultValue={session ?? ""} maxLength={2048}
              placeholder="https://meet.google.com/abc-defg-hij"
              style={{ background: "#fff", color: "#000", border: "1px solid #e5e5e5", borderRadius: 16, padding: "10px 14px", minWidth: 0, fontWeight: 400 }} />
          </label>
          <button type="submit" style={{ alignSelf: "end", background: "#000", color: "#fff", border: "1px solid #000", borderRadius: 16, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>表示する</button>
        </form>
        <p style={{ fontSize: 13, marginBottom: 20 }}>
          <Link href="/">会議へ参加する</Link>
          {selected && <> · <Link href="/monitor">参加中の会議を自動表示</Link></>}
        </p>
        {invalid ? (
          <p role="alert">Google Meetの会議URL、会議コード（例: abc-defg-hij）、または参加後のBot IDを入力してください。</p>
        ) : (
          <MonitorConnection key={demo ? "demo" : sessionId ?? meetingUrl ?? "auto"} sessionId={sessionId} meetingUrl={meetingUrl} demo={demo} />
        )}
      </div>
    </main>
  );
}

export default function MonitorPage(props: { searchParams: Promise<{ session?: string; demo?: string }> }) {
  return (
    <Suspense fallback={<p>モニターに接続しています…</p>}>
      <ConnectedMonitor {...props} />
    </Suspense>
  );
}
