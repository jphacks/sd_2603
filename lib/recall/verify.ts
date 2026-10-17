import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify Recall real-time webhook signatures before parsing the raw payload. */
export function verifyRecallWebhook(raw: string, headers: Headers, secret: string, now = Date.now()): boolean {
  if (!secret.startsWith("whsec_")) return false;
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest();
  return signatures.split(" ").some(part => {
    const [version, signature] = part.split(",");
    if (version !== "v1" || !signature) return false;
    const supplied = Buffer.from(signature, "base64");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}
