import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 5 * 60;

function headerValue(headers: Headers | Record<string, string>, name: string) {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? "";
  }
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1] ?? "";
}

export function verifyRecallWebhook(input: {
  secret: string;
  headers: Headers | Record<string, string>;
  payload: string;
  nowSeconds?: number;
}) {
  const secret = input.secret.trim();
  const msgId = headerValue(input.headers, "webhook-id");
  const msgTimestamp = headerValue(input.headers, "webhook-timestamp");
  const msgSignature = headerValue(input.headers, "webhook-signature");
  if (!secret.startsWith("whsec_") || !msgId || !msgTimestamp || !msgSignature) {
    throw new Error("Webhook signature is missing");
  }
  const timestamp = Number(msgTimestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_SECONDS) {
    throw new Error("Webhook timestamp is outside the allowed window");
  }
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key)
    .update(`${msgId}.${msgTimestamp}.${input.payload}`)
    .digest();
  for (const versioned of msgSignature.split(" ")) {
    const comma = versioned.indexOf(",");
    if (comma <= 0 || versioned.slice(0, comma) !== "v1") continue;
    const actual = Buffer.from(versioned.slice(comma + 1), "base64");
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return;
  }
  throw new Error("Webhook signature does not match");
}
