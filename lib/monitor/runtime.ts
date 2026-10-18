export type MonitorRuntime = {
  jev: "ready" | "mock" | "blocked" | "missing_key" | "unknown_provider";
  audio: "enabled" | "disabled";
  canProbe: boolean;
};

export function monitorRuntime(env: Record<string, string | undefined>): MonitorRuntime {
  const provider = env.AI_PROVIDER ?? "mock";
  const jev = provider === "mock" ? "mock" : provider !== "jev" ? "unknown_provider"
    : env.ALLOW_PAID_AI !== "true" ? "blocked" : !env.AI_GATEWAY_API_KEY?.trim() ? "missing_key" : "ready";
  const control = env.RECALL_CONTROL_TOKEN?.trim();
  return {
    jev,
    audio: env.ENABLE_REALTIME_TRANSCRIPTION === "true" ? "enabled" : "disabled",
    canProbe: env.BROWSER_CONTROL_ENABLED === "true" && Boolean(control && control.length >= 32 && !/\s/.test(control)),
  };
}
