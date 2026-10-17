import { Suspense } from "react";
import { MonitorConnection } from "@/components/score-monitor/MonitorConnection";
async function ConnectedMonitor({
  searchParams,
}: {
  searchParams: Promise<{
    session?: string;
  }>;
}) {
  const params = await searchParams;
  if (params.session && !/^[A-Za-z0-9_-]{1,128}$/.test(params.session))
    return <p>セッションIDが正しくありません。</p>;
  const sessionId = /^[A-Za-z0-9_-]{1,128}$/.test(params.session ?? "")
    ? params.session!
    : "judge";
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090f13",
        padding: "24px 12px",
        display: "grid",
        placeItems: "start center",
      }}
    >
      <MonitorConnection
        key={sessionId}
        sessionId={sessionId}
      />
    </main>
  );
}

export default function MonitorPage(props: {
  searchParams: Promise<{
    session?: string;
  }>;
}) {
  return (
    <Suspense fallback={<p>モニターに接続しています…</p>}>
      <ConnectedMonitor {...props} />
    </Suspense>
  );
}
