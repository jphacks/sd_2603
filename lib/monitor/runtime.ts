export type MonitorRuntime = { audio: "enabled" | "disabled" };

export function monitorRuntime(env: Record<string, string | undefined>): MonitorRuntime {
  return { audio: env.ENABLE_REALTIME_TRANSCRIPTION === "true" ? "enabled" : "disabled" };
}
