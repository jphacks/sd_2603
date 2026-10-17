import type { FocusSession } from "./types";

/** Ordinary conversation is not an agenda. Accept Drive links or an explicit agenda command. */
export function agendaCandidate(session: Pick<FocusSession, "meetChat">) {
  for (const message of [...(session.meetChat ?? [])].reverse()) {
    const link = message.links.find(value => {
      try { const url = new URL(value); return url.protocol === "https:" && ["drive.google.com", "docs.google.com"].includes(url.hostname); }
      catch { return false; }
    });
    if (link) return { messageId: message.id, link, text: "" };
    if (/^\s*(?:@Focus\s*)?(?:#agenda\b|#アジェンダ|アジェンダ[:：])/i.test(message.text)) {
      const text = message.text.replace(/^\s*(?:@Focus\s*)?(?:#agenda\b|#アジェンダ|アジェンダ[:：])\s*/i, "").trim();
      if (text) return { messageId: message.id, text };
    }
  }
  return null;
}

export function needsAgendaImport(session: FocusSession, now = Date.now()) {
  const candidate = agendaCandidate(session);
  if (session.closed || !candidate) return false;
  const status = session.agendaImport;
  if (status?.state === "processing" && now - status.startedAt < 60000) return false;
  return !status || status.state === "processing" || status.messageId !== candidate.messageId;
}
