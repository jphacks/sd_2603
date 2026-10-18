import { Suspense } from "react";
import { connection } from "next/server";
import { ensureStateWritable, localRecallIo } from "@/scripts/recall.mjs";
import { JoinForm } from "./join-form";

async function ConfiguredJoinForm() {
  await connection();
  const serverManagedControl = process.env.BROWSER_CONTROL_ENABLED === "true";
  let setupError: string | null = null;
  if (serverManagedControl) {
    try {
      await ensureStateWritable(localRecallIo());
    } catch {
      setupError = "参加情報を保存できないため、現在は入室できません。管理者にサーバーの保存先設定を確認してください。";
    }
  }
  return <JoinForm serverManagedControl={serverManagedControl} setupError={setupError} />;
}

export default function Home() {
  return <Suspense fallback={<p>参加画面を読み込んでいます…</p>}><ConfiguredJoinForm /></Suspense>;
}
