import { cookies } from "next/headers";
import { createMeetingSession, readMeetingSession } from "./meeting-session";

const name = "meeting_session";
export async function meetingOwner(create = false): Promise<string | null> {
  const secret = process.env.RECALL_CONTROL_TOKEN?.trim();
  if (!secret || secret.length < 32) return null;
  const jar = await cookies();
  const owner = readMeetingSession(jar.get(name)?.value, secret);
  if (owner || !create) return owner;
  const session = createMeetingSession(secret);
  jar.set(name, session.value, { httpOnly: true, secure: process.env.VERCEL === "1", sameSite: "lax", path: "/", maxAge: session.maxAge });
  return session.owner;
}
