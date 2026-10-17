import { z } from "zod";
import { loadSession, updateSession } from "@/lib/focus/store";
import { applyAction, FocusError } from "@/lib/focus/model";
import { apiError, bearer, input, privateJson } from "@/lib/focus/http";
import { agendaText } from "@/lib/recall/chat";
import { downloadAgenda, parseAgendaFile } from "@/lib/recall/agenda-file";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await loadSession(id, bearer(request));
    if (session.closed) throw new FocusError("この会議は終了しています。", 409);
    const body = z.object({ messageId: z.string().min(1).max(200), link: z.string().url().optional() }).safeParse(await input(request));
    if (!body.success) throw new FocusError("取り込むメッセージを選択してください。");
    const message = session.meetChat?.find(item => item.id === body.data.messageId);
    if (!message) throw new FocusError("メッセージが見つかりません。", 404);
    let text: string;
    if (body.data.link) {
      if (!message.links.includes(body.data.link)) throw new FocusError("受信したメッセージ内のリンクを選択してください。");
      try { text = await parseAgendaFile(await downloadAgenda(body.data.link, fetch, process.env.GOOGLE_DRIVE_ACCESS_TOKEN)); }
      catch (error) { throw new FocusError(error instanceof Error ? error.message : "ファイルを読み込めませんでした。", 422); }
    } else text = agendaText(message);
    if (!text || text.length > 20000) throw new FocusError("アジェンダは1〜20000文字で指定してください。");
    const next = await updateSession(id, bearer(request), session.revision, current => applyAction(current, { action: "agenda", agenda: text }));
    return privateJson({ session: next, message: "Meetチャットからアジェンダを取り込みました。" });
  } catch (error) { return apiError(error); }
}
