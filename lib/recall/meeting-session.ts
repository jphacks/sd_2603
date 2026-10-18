import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const lifetime = 30 * 24 * 60 * 60;
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function createMeetingSession(secret: string, now = Date.now()) {
  const owner = randomBytes(32).toString("hex");
  const payload = `${owner}.${Math.floor(now / 1000) + lifetime}`;
  return { owner, value: `${payload}.${signature(payload, secret)}`, maxAge: lifetime };
}
export function readMeetingSession(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value || value.length > 200) return null;
  const [owner, expiry, signed, extra] = value.split(".");
  if (extra || !/^[a-f0-9]{64}$/.test(owner ?? "") || !/^\d{10}$/.test(expiry ?? "") || !signed || Number(expiry) <= now / 1000) return null;
  const actual = Buffer.from(signed);
  const expected = Buffer.from(signature(`${owner}.${expiry}`, secret));
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? owner : null;
}
