import { FocusError } from "./model";

export function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
}

export function privateJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}

export async function input(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new FocusError("送信元を確認できません。", 403);
  const text = await request.text();
  if (text.length > 150_000) throw new FocusError("入力が大きすぎます。", 413);
  try { return JSON.parse(text) as unknown; }
  catch { throw new FocusError("入力形式が正しくありません。"); }
}

export function apiError(error: unknown) {
  if (error instanceof FocusError) return privateJson({ error: error.message }, error.status);
  return privateJson({ error: "Focusの処理に失敗しました。接続と設定を確認してください。" }, 500);
}
