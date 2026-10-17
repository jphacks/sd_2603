import { loadSession, updateSession } from "@/lib/focus/store";
import { apiError, bearer, input, privateJson } from "@/lib/focus/http";
import { agendaCandidate, needsAgendaImport } from "@/lib/focus/agenda";
import { downloadAgenda, parseAgendaFile } from "@/lib/recall/agenda-file";

// The operator polls this authenticated endpoint; downloads never delay Recall webhook acknowledgments.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await input(request);
    const { id } = await context.params;
    const token = bearer(request);
    const session = await loadSession(id, token);
    const candidate = agendaCandidate(session);
    if (!candidate || !needsAgendaImport(session)) return privateJson(session);
    const attemptId = crypto.randomUUID();
    const startedAt = Date.now();
    await updateSession(id, token, session.revision, current => ({
      ...current, revision: current.revision + 1,
      agendaImport: { messageId: candidate.messageId, state: "processing", startedAt, attemptId },
    }));
    let text = "", failure: string | undefined;
    try {
      text = candidate.link ? await parseAgendaFile(await downloadAgenda(candidate.link, fetch, process.env.GOOGLE_DRIVE_ACCESS_TOKEN)) : candidate.text;
      if (!text || text.length > 20000) throw new Error("アジェンダは1〜20000文字にしてください。");
    } catch (error) { failure = error instanceof Error ? error.message : "アジェンダを読み込めませんでした。"; }
    const current = await loadSession(id, token);
    if (current.closed || current.agendaImport?.attemptId !== attemptId) return privateJson(current);
    const result = await updateSession(id, token, current.revision, value => ({
      ...value, revision: value.revision + 1,
      agenda: failure ? value.agenda : text,
      agendaImport: { messageId: candidate.messageId, state: failure ? "error" : "ready", startedAt, attemptId, ...(failure ? { error: failure } : {}) },
    }));
    return privateJson(result);
  } catch (error) { return apiError(error); }
}
