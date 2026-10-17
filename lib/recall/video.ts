import sharp from "sharp";

const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 720;
const MAX_IMAGE_BYTES = 1_300_000;

export type VideoView =
  | { kind: "idle" }
  | { kind: "off_agenda"; agenda: string }
  | { kind: "stalled" };

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character] ?? character);
}

function truncate(value: string, maxCharacters: number) {
  const characters = Array.from(value.trim());
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters - 1).join("")}…`
    : value.trim();
}

export function videoCopy(view: VideoView) {
  if (view.kind === "idle") {
    return { eyebrow: "MEETING FACILITATOR", title: "会議を見守っています", subtitle: "必要なときだけ、ひとこと。" };
  }
  if (view.kind === "stalled") {
    return { eyebrow: "少し立ち止まって", title: "ここまでの意見を整理しませんか", subtitle: "決めるために、次の一歩を。" };
  }
  const agenda = truncate(view.agenda, 30);
  return {
    eyebrow: "アジェンダに戻るタイミングです",
    title: `「${agenda}」`,
    subtitle: "というアジェンダに戻りましょう",
  };
}

export function videoSvg(view: VideoView) {
  const copy = videoCopy(view);
  const active = view.kind !== "idle";
  const titleSize = view.kind === "off_agenda" ? 50 : 55;
  const color = active ? "#214344" : "#677d75";
  const titleCharacters = Array.from(copy.title);
  const titleLines = view.kind === "off_agenda" && titleCharacters.length > 16
    ? [titleCharacters.slice(0, 16).join(""), titleCharacters.slice(16).join("")]
    : [copy.title];
  const titleMarkup = titleLines.map((line, index) =>
    `<text x="220" y="${titleLines.length === 1 ? 380 : 350 + index * 68}" fill="${color}" font-family="sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(line)}</text>`
  ).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <rect width="1280" height="720" fill="#f5f6f1"/>
  <rect x="92" y="106" width="1096" height="508" rx="52" fill="#fffefa"/>
  <rect x="160" y="180" width="14" height="360" rx="7" fill="${active ? "#e0a668" : "#aec5b5"}"/>
  <circle cx="1090" cy="205" r="18" fill="${active ? "#e0a668" : "#aec5b5"}"/>
  <text x="220" y="260" fill="#698278" font-family="sans-serif" font-size="30" font-weight="600">${escapeXml(copy.eyebrow)}</text>
  ${titleMarkup}
  <text x="220" y="${titleLines.length === 1 ? 465 : 502}" fill="${color}" font-family="sans-serif" font-size="43" font-weight="500">${escapeXml(copy.subtitle)}</text>
  <text x="220" y="551" fill="#8ba098" font-family="sans-serif" font-size="26">Meeting Facilitator</text>
</svg>`;
}

export async function renderVideoJpeg(view: VideoView) {
  const jpeg = await sharp(Buffer.from(videoSvg(view)))
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  if (jpeg.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Rendered video card exceeds Recall.ai image limit");
  }
  return jpeg;
}

export class RecallVideoError extends Error {
  readonly kind: "config" | "auth" | "rate_limit" | "upstream";
  readonly diagnostic?:
    | { stage: "http"; providerStatus: number }
    | { stage: "transport"; errorName: string; causeCode?: string };
  constructor(kind: RecallVideoError["kind"], message: string, diagnostic?: RecallVideoError["diagnostic"]) {
    super(message);
    this.name = "RecallVideoError";
    this.kind = kind;
    this.diagnostic = diagnostic;
  }
}

const SAFE_CAUSE_CODES = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED",
  "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
]);

function transportDiagnostic(error: unknown): Extract<NonNullable<RecallVideoError["diagnostic"]>, { stage: "transport" }> {
  const name = error instanceof Error ? error.name : "UnknownError";
  const errorName = ["TypeError", "AbortError", "TimeoutError"].includes(name) ? name : "OtherError";
  let cause: unknown = error;
  for (let depth = 0; depth < 3 && cause && typeof cause === "object"; depth++) {
    const code = "code" in cause ? cause.code : undefined;
    if (typeof code === "string" && SAFE_CAUSE_CODES.has(code)) {
      return { stage: "transport", errorName, causeCode: code };
    }
    cause = "cause" in cause ? cause.cause : undefined;
  }
  return { stage: "transport", errorName };
}

export async function outputVideo(
  botId: string,
  jpeg: Buffer,
  options: { apiKey?: string; region?: string; fetch?: typeof fetch } = {},
) {
  const apiKey = options.apiKey ?? process.env.RECALL_API_KEY;
  if (!apiKey) throw new RecallVideoError("config", "RECALL_API_KEY is not configured");
  const region = options.region ?? process.env.RECALL_REGION;
  if (!region || !["us-east-1", "us-west-2", "eu-central-1", "ap-northeast-1"].includes(region)) {
    throw new RecallVideoError("config", "Unsupported Recall.ai region");
  }
  const response = await (options.fetch ?? fetch)(
    `https://${region}.recall.ai/api/v1/bot/${encodeURIComponent(botId)}/output_video/`,
    {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "jpeg", b64_data: jpeg.toString("base64") }),
      signal: AbortSignal.timeout(10_000),
    },
  ).catch((error: unknown) => {
    throw new RecallVideoError("upstream", "Recall.ai request failed", transportDiagnostic(error));
  });
  if (!response.ok) {
    const kind = response.status === 401 || response.status === 403 ? "auth"
      : response.status === 429 ? "rate_limit" : "upstream";
    throw new RecallVideoError(kind, `Recall.ai returned HTTP ${response.status}`, {
      stage: "http", providerStatus: response.status,
    });
  }
}
