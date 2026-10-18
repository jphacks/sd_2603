import sharp from "sharp";
import { FACE_FRAME, faceGroup, type FaceKind } from "../brand/faces.ts";

const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 720;
const MAX_IMAGE_BYTES = 1_300_000;

export type VideoView =
  | { kind: "idle" }
  | { kind: "off_agenda"; agenda: string }
  | { kind: "stalled"; cause?: "silence" | "repetition" };

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

// The face AIDA shows for each view (see DESIGN.md).
const FACES: Record<VideoView["kind"], FaceKind> = {
  idle: "watching",
  stalled: "nudge",
  off_agenda: "redirect",
};

// Meet may crop the 16:9 camera to its tile, so keep everything inside the
// centered 4:3 area (960px wide).
const LINE_CHARACTERS = 17;
const AGENDA_CHARACTERS = LINE_CHARACTERS - 2;
const FONT_SIZE = 54;
const LINE_GAP = 22;
const FACE_SCALE = 0.95;
const FACE_TEXT_GAP = 60;

export function videoCopy(view: VideoView): { message: string | null; lines: string[] } {
  if (view.kind === "idle") return { message: null, lines: [] };
  if (view.kind === "stalled" && view.cause === "silence") {
    // Invite someone to speak rather than summarize.
    return { message: "ここまでで、気になる点はありますか？", lines: ["ここまでで、", "気になる点はありますか？"] };
  }
  if (view.kind === "stalled") {
    const message = "ここまでの意見を、整理しませんか？";
    return { message, lines: [message] };
  }
  const message = `「${view.agenda.trim()}」に戻りませんか？`;
  if (Array.from(message).length <= LINE_CHARACTERS) return { message, lines: [message] };
  return { message, lines: [`「${truncate(view.agenda, AGENDA_CHARACTERS)}」`, "に戻りませんか？"] };
}

export function videoSvg(view: VideoView) {
  const { lines } = videoCopy(view);
  const frameHeight = FACE_FRAME.height * FACE_SCALE;
  const textHeight = lines.length ? FACE_TEXT_GAP + lines.length * FONT_SIZE + (lines.length - 1) * LINE_GAP : 0;
  const top = (IMAGE_HEIGHT - frameHeight - textHeight) / 2;
  const left = IMAGE_WIDTH / 2 - (FACE_FRAME.width * FACE_SCALE) / 2;
  const textMarkup = lines.map((line, index) => {
    // Baseline sits about 0.88em below the top of each line.
    const y = top + frameHeight + FACE_TEXT_GAP + index * (FONT_SIZE + LINE_GAP) + FONT_SIZE * 0.88;
    return `<text x="${IMAGE_WIDTH / 2}" y="${Math.round(y)}" text-anchor="middle" fill="#000000" font-family="Noto Sans JP, Hiragino Sans, Yu Gothic, sans-serif" font-size="${FONT_SIZE}" font-weight="700">${escapeXml(line)}</text>`;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="#ffffff"/>
  ${faceGroup(FACES[view.kind], Math.round(left * 10) / 10, Math.round(top * 10) / 10, FACE_SCALE, "#000000")}
  ${textMarkup}
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
