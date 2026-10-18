const GOOGLE_MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function normalizeGoogleMeetUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "meet.google.com" ||
    url.port ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  const code = segments[0].toLowerCase();
  if (!GOOGLE_MEET_CODE.test(code)) return null;

  return `https://meet.google.com/${code}`;
}

