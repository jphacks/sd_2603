import { loadSession, updateSession } from "@/lib/focus/store";
import { applyAction, FocusError } from "@/lib/focus/model";
import { apiError, bearer, input, privateJson } from "@/lib/focus/http";
import { judge } from "@/lib/judge";
import { JevError } from "@/lib/judge/jev";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await input(request);
    const session = await loadSession(id, bearer(request));
    if (session.closed) throw new FocusError("この会議は終了しています。", 409);
    if (session.proposal?.state === "pending") throw new FocusError("現在の提案を共有・保留してから判定してください。", 409);
    if (!session.agenda.trim()) throw new FocusError("先にアジェンダを保存してください。");
    const result = await judge({
      agenda: session.agenda.slice(0, 500),
      transcript: session.notes.slice(-30).map(note => note.text.slice(0, 1000)),
      secondsSinceLastIntervention: session.lastSharedAt ? Math.max(0, (Date.now() - session.lastSharedAt) / 1000) : 60,
    });
    const next = result.action === "INTERVENE" && result.message
      ? await updateSession(id, bearer(request), session.revision, current => applyAction(current, { action: "propose", message: result.message!.slice(0, 500) }))
      : session;
    return privateJson({ session: next, message: result.action === "INTERVENE" ? "提案を準備しました。内容を確認して共有してください。" : result.action === "WAIT" ? "今は提案を待ちます。メモが少ない場合は会話の内容を追加してください。" : "今は介入を控えます。" });
  } catch (error) {
    if (error instanceof JevError) return privateJson({ error: "判定サービスに接続できませんでした。時間をおいて再実行してください。" }, 502);
    return apiError(error);
  }
}
