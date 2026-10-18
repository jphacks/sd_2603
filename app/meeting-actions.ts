"use server";

import { z } from "zod";
import { POST as postJoin } from "./api/recall/join/route";
import { POST as postMeetings } from "./api/recall/meetings/route";
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

export async function leaveMeeting(botId: string) {
  if (typeof botId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(botId)) return { ok: false, status: 400, data: { error: "退出する会議を選択してください。" } };
  const result = await invokeBrowserControl(process.env.BROWSER_CONTROL_ENABLED === "true", postLeave, { botId }, process.env.RECALL_CONTROL_TOKEN);
  return { ...result, data: {
    left: result.data.left === true,
    alreadyGone: result.data.alreadyGone === true,
    error: typeof result.data.error === "string" ? result.data.error : undefined,
  } };
}

export async function listMeetings() {
  const result = await invokeBrowserControl(process.env.BROWSER_CONTROL_ENABLED === "true", postMeetings, {}, process.env.RECALL_CONTROL_TOKEN);
  return { ...result, data: {
    meetings: Array.isArray(result.data.meetings) ? result.data.meetings as { id: string; meetingUrl: string; status: string }[] : [],
    error: typeof result.data.error === "string" ? result.data.error : undefined,
  } };
}
