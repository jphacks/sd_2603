export type MeetingSelection =
  | { kind: "meeting"; value: string }
  | { kind: "session"; value: string };

export function parseMeetingSelection(input: string): MeetingSelection | null {
  const value = input.trim();
  if (value.length > 2048) return null;
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(value))
    return { kind: "meeting", value: `https://meet.google.com/${value.toLowerCase()}` };
  if (value.includes("://")) {
    try {
      const url = new URL(value);
      const code = url.pathname.replace(/\/$/, "").slice(1);
      if (url.origin !== "https://meet.google.com" || url.username || url.password || !/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(code)) return null;
      return { kind: "meeting", value: `https://meet.google.com/${code.toLowerCase()}` };
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? { kind: "session", value } : null;
}
