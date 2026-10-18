"use server";

import { POST } from "../api/monitor/check/route";
import { invokeBrowserControl } from "@/lib/recall/browser-control";

export async function checkJevConnection() {
  const result = await invokeBrowserControl(process.env.BROWSER_CONTROL_ENABLED === "true", POST, {}, process.env.RECALL_CONTROL_TOKEN);
  return {
    ok: result.ok && result.data.ok === true,
    model: typeof result.data.model === "string" ? result.data.model : undefined,
    latencyMs: typeof result.data.latencyMs === "number" ? result.data.latencyMs : undefined,
    checkedAt: typeof result.data.checkedAt === "number" ? result.data.checkedAt : undefined,
    error: typeof result.data.error === "string" ? result.data.error : undefined,
  };
}
