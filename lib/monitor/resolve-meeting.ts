import { readFile, readdir } from "node:fs/promises";
import { botStatePath, listMeetingBots, localRecallIo } from "../../scripts/recall.mjs";
import { parseMeetingSelection } from "./meeting.ts";
import { monitorStore } from "./store.ts";

let shared: { expires: number; meetings: { id: string; meetingUrl: string }[] } | undefined;
let loading: Promise<{ id: string; meetingUrl: string }[]> | undefined;

async function readCurrent(): Promise<unknown> {
  const io = localRecallIo();
  const directory = botStatePath(io, "probe").replace(/probe\.json$/, "");
  const names = await readdir(directory).catch(() => [] as string[]);
  const local = await Promise.all(names.filter(name => /^[A-Za-z0-9_-]+\.json$/.test(name)).map(name =>
    readFile(directory + name, "utf8").then(text => JSON.parse(text)).catch(() => null)));
  const legacy = await readFile(io.statePath, "utf8").then(text => JSON.parse(text)).catch(() => null);
  if (io.env.VERCEL !== "1") return [...local, legacy];
  if (!shared || shared.expires < Date.now()) {
    loading ??= listMeetingBots(io).then(meetings => {
      shared = { expires: Date.now() + 30000, meetings };
      return meetings;
    }).finally(() => { loading = undefined; });
    await loading;
  }
  return shared?.meetings ?? [];
}

export async function resolveMeetingSession(reference: string, loadCurrent = readCurrent): Promise<string | null> {
  const selected = parseMeetingSelection(reference);
  if (selected?.kind !== "meeting") return null;
  const known = monitorStore.resolveMeeting(selected.value);
  const loaded: unknown = await loadCurrent().catch(() => null);
  const candidates: unknown[] = Array.isArray(loaded) ? [...loaded] : [loaded];
  for (const current of candidates.reverse()) {
    if (!current || typeof current !== "object" || !("id" in current) || !("meetingUrl" in current)) continue;
    if (typeof current.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(current.id) || typeof current.meetingUrl !== "string") continue;
    const meeting = parseMeetingSelection(current.meetingUrl);
    if (meeting?.kind !== "meeting" || meeting.value !== selected.value) continue;
    monitorStore.registerMeeting(current.id, meeting.value);
    return current.id;
  }
  return known;
}
