export class AgendaError extends Error {
  readonly kind: "document" | "config" | "model";

  constructor(kind: AgendaError["kind"], message: string) {
    super(message);
    this.name = "AgendaError";
    this.kind = kind;
  }
}

const MAX_DOCUMENT_BYTES = 100_000;

function allowedDocumentHost(hostname: string) {
  return hostname === "docs.google.com" || hostname.endsWith(".googleusercontent.com");
}

export async function fetchPublicDocument(
  exportUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let current = exportUrl;
  let response: Response | null = null;
  for (let hop = 0; hop < 3; hop += 1) {
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new AgendaError("document", "ドキュメントを取得できません");
    }
    if (response.status < 300 || response.status >= 400) break;
    const next = response.headers.get("location");
    let redirected: URL;
    try {
      redirected = new URL(next ?? "", current);
    } catch {
      throw new AgendaError("document", "ドキュメントの取得先が不正です");
    }
    if (redirected.protocol !== "https:" || !allowedDocumentHost(redirected.hostname)) {
      throw new AgendaError("document", "ドキュメントの取得先が不正です");
    }
    current = redirected.toString();
    response = null;
  }
  if (!response || !response.ok) throw new AgendaError("document", "ドキュメントを取得できません");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new AgendaError("document", "ドキュメントの本文を使えません");
  }
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trim();
  const contentType = response.headers.get("content-type") ?? "";
  if (!text || /html/i.test(contentType) || text.startsWith("<")) {
    throw new AgendaError("document", "ドキュメントの本文を使えません");
  }
  return text;
}
