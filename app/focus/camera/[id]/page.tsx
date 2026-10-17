import { Suspense } from "react";
import type { Metadata } from "next";
import { CameraOutput } from "@/components/focus/CameraOutput";

export const metadata: Metadata = {
  title: "Focus · カメラ出力",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Output({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CameraOutput sessionId={id} />;
}

export default function CameraPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="focus-output"><p>Focusを準備しています…</p></main>}><Output params={params} /></Suspense>;
}
