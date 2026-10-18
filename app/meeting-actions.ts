"use server";

import { z } from "zod";
import { POST as postJoin } from "./api/recall/join/route";
import { POST as postLeave } from "./api/recall/leave/route";
import { invokeBrowserControl } from "@/lib/recall/browser-control";

const JoinSchema = z.object({
  meetingUrl: z.string().trim().regex(/^https:\/\/.+/i).max(2048),
  agenda: z.string().max(500),
});

export async function joinMeeting(meetingUrl: string, agenda: string) {
  const input = JoinSchema.safeParse({ meetingUrl, agenda });
  if (!input.success) return { ok: false, status: 400, data: { error: "会議URLとアジェンダを確認してください。" } };
  const result = await invokeBrowserControl(process.env.BROWSER_CONTROL_ENABLED === "true", postJoin, input.data, process.env.RECALL_CONTROL_TOKEN);
  return { ...result, data: {
    id: typeof result.data.id === "string" ? result.data.id : undefined,
    error: typeof result.data.error === "string" ? result.data.error : undefined,
  } };
}

export async function leaveMeeting() {
  const result = await invokeBrowserControl(process.env.BROWSER_CONTROL_ENABLED === "true", postLeave, {}, process.env.RECALL_CONTROL_TOKEN);
  return { ...result, data: {
    left: result.data.left === true,
    alreadyGone: result.data.alreadyGone === true,
    error: typeof result.data.error === "string" ? result.data.error : undefined,
  } };
}
