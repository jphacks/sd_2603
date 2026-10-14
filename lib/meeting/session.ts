import { z } from "zod";

export const configSchema = z.object({
  title: z.string().trim().min(1).max(100),
  agenda: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  minutes: z.number().int().min(1).max(240),
});
export type MeetingConfig = z.infer<typeof configSchema>;
const sessionSchema = z.object({
  config: configSchema,
  phase: z.enum(["running", "paused", "finished"]),
  agendaIndex: z.number().int().min(0),
  elapsedMs: z.number().min(0),
  resumedAt: z.number().nullable(),
  interventionCount: z.number().int().min(0),
}).refine(s => s.agendaIndex < s.config.agenda.length);
export type MeetingSession = z.infer<typeof sessionSchema>;
export const defaultConfig: MeetingConfig = {
  title: "プロダクト定例ミーティング",
  agenda: ["今週の進捗を共有する", "課題と解決策を話し合う", "次のアクションを確認する"],
  minutes: 30,
};
export const sessionKey = "focus-session-v1";
export const configKey = "focus-config-v1";
export function readSession(): MeetingSession | null {
  try { return sessionSchema.parse(JSON.parse(sessionStorage.getItem(sessionKey) ?? "null")); }
  catch { return null; }
}
export function readConfig(): MeetingConfig {
  try { return configSchema.parse(JSON.parse(sessionStorage.getItem(configKey) ?? "null")); }
  catch { return defaultConfig; }
}
export function elapsed(s: MeetingSession, now: number): number {
  return s.elapsedMs + (s.phase === "running" && s.resumedAt !== null ? Math.max(0, now - s.resumedAt) : 0);
}
export function clock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
