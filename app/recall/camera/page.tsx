import { RecallCameraMotion, type CameraMotionMode } from "@/components/recall/RecallCameraMotion";
import type { Metadata } from "next";
import { Suspense } from "react";

const MODES = new Set<CameraMotionMode>(["on-track", "off-track", "silence"]);

export const metadata: Metadata = {
  title: "Focus Camera Motion",
  description: "Recall.ai向けFocusカメラモーションの表示確認",
};

export default function RecallCameraPage({ searchParams }: PageProps<"/recall/camera">) {
  return (
    <Suspense fallback={<RecallCameraMotion />}>
      <CameraFromQuery searchParams={searchParams} />
    </Suspense>
  );
}

async function CameraFromQuery({ searchParams }: Pick<PageProps<"/recall/camera">, "searchParams">) {
  const query = await searchParams;
  const requestedMode = typeof query.mode === "string" ? query.mode : "";
  const initialMode = MODES.has(requestedMode as CameraMotionMode)
    ? requestedMode as CameraMotionMode
    : "on-track";

  return (
    <RecallCameraMotion
      initialMode={initialMode}
      embedded={query.embed === "1"}
      autoplay={query.autoplay === "1"}
    />
  );
}
