import { readFile } from "node:fs/promises";
import { localRecallIo } from "../../scripts/recall.mjs";
import { parseMeetingSelection } from "./meeting.ts";
import { monitorStore } from "./store.ts";

async function readCurrent(): Promise<unknown> {
  return JSON.parse(await readFile(localRecallIo().statePath, "utf8"));
}

export async function resolveMeetingSession(reference: string, loadCurrent = readCurrent): Promise<string | null> {
  const selected = parseMeetingSelection(reference);
  if (selected?.kind !== "meeting") return null;
  const known = monitorStore.resolveMeeting(selected.value);
  // CLI-created bots keep the meeting URL alongside their Bot ID in current.json.
  const current: unknown = await loadCurrent().catch(() => null);
  if (!current || typeof current !== "object" || !("id" in current) || !("meetingUrl" in current)) return known;
  if (typeof current.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(current.id) || typeof current.meetingUrl !== "string") return known;
  const meeting = parseMeetingSelection(current.meetingUrl);
  if (meeting?.kind !== "meeting" || meeting.value !== selected.value) return known;
  monitorStore.registerMeeting(current.id, meeting.value);
  return current.id;
}
