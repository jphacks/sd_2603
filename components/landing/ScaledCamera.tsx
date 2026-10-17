"use client";

import { useEffect, useRef, useState } from "react";
import { RecallCameraMotion, type CameraMotionMode } from "@/components/recall/RecallCameraMotion";

const BASE_WIDTH = 640;
const BASE_HEIGHT = 360;

/** Renders the camera at a fixed size and scales it to cover the tile like a video feed, keeping its proportions. */
export function ScaledCamera({ mode }: { mode: CameraMotionMode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 0, left: 0, top: 0 });

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const scale = Math.max(width / BASE_WIDTH, height / BASE_HEIGHT);
      setFit({ scale, left: (width - BASE_WIDTH * scale) / 2, top: (height - BASE_HEIGHT * scale) / 2 });
    });
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: fit.left,
          top: fit.top,
          width: BASE_WIDTH,
          transform: `scale(${fit.scale})`,
          transformOrigin: "top left",
          visibility: fit.scale ? "visible" : "hidden",
        }}
      >
        <RecallCameraMotion inline initialMode={mode} />
      </div>
    </div>
  );
}
