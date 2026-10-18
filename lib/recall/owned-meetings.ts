import { listMeetingBots, localRecallIo } from "../../scripts/recall.mjs";

const cached = new Map<string, { expires: number; meetings: { id: string; meetingUrl: string; status: string }[] }>();
export function invalidateOwnedMeetings(owner: string) { cached.delete(owner); }
export async function ownedMeetings(owner: string, refresh = false) {
  const previous = cached.get(owner);
  if (!refresh && previous && previous.expires > Date.now()) return previous.meetings;
  const meetings = await listMeetingBots(localRecallIo(), owner);
  if (cached.size > 128) cached.delete(cached.keys().next().value!);
  cached.set(owner, { expires: Date.now() + 60000, meetings });
  return meetings;
}
