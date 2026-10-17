import { unzipSync, strFromU8 } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { getDocumentProxy } from "unpdf";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 20000;

export function driveDownloadUrl(source: string): URL {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Google DriveのHTTPSリンクを指定してください。");
  let id: string | undefined;
  if (url.hostname === "drive.google.com") id = url.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id") ?? undefined;
  if (url.hostname === "docs.google.com") id = url.pathname.match(/^\/(?:document|file)\/d\/([\w-]+)/)?.[1];
  if (!id || !/^[\w-]{10,200}$/.test(id)) throw new Error("Google Driveのファイル共有リンクに対応しています。");
  const result = new URL("https://drive.google.com/uc");
  result.searchParams.set("export", "download"); result.searchParams.set("id", id);
  // Resource keys on existing link-shared files are needed without changing sharing permissions.
  const resourceKey = url.searchParams.get("resourcekey");
  if (resourceKey && /^[\w-]{1,200}$/.test(resourceKey)) result.searchParams.set("resourcekey", resourceKey);
  return result;
}

function allowedDownload(url: URL) {
  return url.protocol === "https:" && !url.port && !url.username && !url.password
    && ["drive.google.com", "drive.usercontent.google.com", "docs.google.com"].includes(url.hostname);
}

export async function downloadAgenda(source: string, fetcher: typeof fetch = fetch, googleAccessToken?: string): Promise<Uint8Array> {
  let url = driveDownloadUrl(source);
  if (googleAccessToken) url = new URL(`https://www.googleapis.com/drive/v3/files/${url.searchParams.get("id")}?alt=media`);
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const isGoogleApi = url.origin === "https://www.googleapis.com" && url.pathname.startsWith("/drive/v3/files/");
    if (!allowedDownload(url) && !isGoogleApi) throw new Error("このリンクのダウンロード先には対応していません。Google認証が必要な場合があります。");
    const response = await fetcher(url, { redirect: "manual", cache: "no-store", signal, headers: isGoogleApi && googleAccessToken ? { Authorization: `Bearer ${googleAccessToken}` } : {} });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("ファイルへ接続できません。");
      url = new URL(location, url); continue;
    }
    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("ファイルを取得できません。非公開のDriveファイルには別途Google認証が必要です。共有設定は変更しないでください。");
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("ファイルは5MBまでです。");
    if (!response.body) throw new Error("ファイルが空です。");
    const reader = response.body.getReader();
    const parts: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break;
        length += item.value.byteLength;
        if (length > MAX_BYTES) throw new Error("ファイルは5MBまでです。");
        parts.push(item.value);
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(parts);
  }
  throw new Error("リダイレクトが多すぎます。");
}

export async function parseAgendaFile(data: Uint8Array): Promise<string> {
  if (!data.length || data.byteLength > MAX_BYTES) throw new Error("ファイルは空でない5MB以下のPDF/DOCXを指定してください。");
  let text: string;
  if (Buffer.from(data.subarray(0, 5)).toString() === "%PDF-") {
    const pdf = await getDocumentProxy(new Uint8Array(data), { useSystemFonts: false });
    try {
      if (pdf.numPages > 100) throw new Error("PDFは100ページまでです。");
      const pages: string[] = []; let length = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const line = content.items.map(item => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("");
        length += line.length;
        if (length > MAX_TEXT) throw new Error("アジェンダは20000文字までです。");
        pages.push(line); page.cleanup();
      }
      text = pages.join("\n");
    } finally { await pdf.loadingTask.destroy(); }
  } else if (data[0] === 0x50 && data[1] === 0x4b) {
    // Only decompress the document body, never embedded objects or images.
    const files = unzipSync(data, { filter: file => file.name === "word/document.xml" && file.originalSize <= 2 * 1024 * 1024 });
    const document = files["word/document.xml"];
    if (!document || document.length > 2 * 1024 * 1024) throw new Error("DOCXの本文が見つからないか、大きすぎます。");
    const xml = strFromU8(document);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("安全に読み取れないDOCXです。");
    const tree = new XMLParser({ preserveOrder: true, ignoreAttributes: true, parseTagValue: false, trimValues: false }).parse(xml);
    const parts: string[] = []; let length = 0;
    function append(value: string) {
      length += value.length;
      if (length > MAX_TEXT) throw new Error("アジェンダは20000文字までです。");
      parts.push(value);
    }
    function walk(nodes: unknown, depth = 0, inText = false) {
      if (depth > 100) throw new Error("DOCXの構造が複雑すぎます。");
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        for (const [tag, value] of Object.entries(node as Record<string, unknown>)) {
          if (tag === "#text" && inText) append(String(value));
          else if (tag === "w:tab") append("\t");
          else if (tag === "w:br") append("\n");
          else { walk(value, depth + 1, tag === "w:t"); if (tag === "w:p") append("\n"); }
        }
      }
    }
    walk(tree); text = parts.join("");
  } else throw new Error("PDFとDOCXに対応しています。旧形式のDOCはDOCXへ変換してください。");
  text = text.trim();
  if (!text) throw new Error("本文を抽出できませんでした。画像だけのPDFはOCRが必要です。");
  if (text.length > MAX_TEXT) throw new Error("アジェンダは20000文字までです。");
  return text;
}
