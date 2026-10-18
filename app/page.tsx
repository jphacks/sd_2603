import { Suspense } from "react";
import { connection } from "next/server";
import { JoinForm } from "./join-form";

async function ConfiguredJoinForm() {
  await connection();
  const serverManagedControl = process.env.BROWSER_CONTROL_ENABLED === "true";
  return <JoinForm serverManagedControl={serverManagedControl} />;
}

export default function Home() {
  return <Suspense fallback={<p>参加画面を読み込んでいます…</p>}><ConfiguredJoinForm /></Suspense>;
}
