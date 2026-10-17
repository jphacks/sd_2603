import type { FocusAction, FocusCameraState, FocusSession } from "./types";

export class FocusError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function cameraState(session: FocusSession): FocusCameraState {
  return {
    title: session.title, sharedMessage: session.closed ? null : session.sharedMessage,
    closed: session.closed, revision: session.revision,
  };
}

export function applyAction(session: FocusSession, action: FocusAction): FocusSession {
  if (session.closed) throw new FocusError("この会議は終了しています。", 409);
  const next = { ...session, revision: session.revision + 1 };
  switch (action.action) {
    case "agenda": next.agenda = action.agenda; break;
    case "note":
      if (session.notes.length >= 50) throw new FocusError("メモは50件までです。");
      next.notes = [...session.notes, { id: crypto.randomUUID(), text: action.text, createdAt: new Date().toISOString() }];
      if (action.agenda !== undefined) next.agenda = action.agenda;
      break;
    case "propose":
      next.proposal = { id: crypto.randomUUID(), message: action.message, state: "pending" };
      break;
    case "share":
    case "defer":
      if (!session.proposal || session.proposal.id !== action.proposalId || session.proposal.state !== "pending") {
        throw new FocusError("提案が更新されました。最新の提案を確認してください。", 409);
      }
      next.proposal = { ...session.proposal, state: action.action === "share" ? "shared" : "deferred" };
      if (action.action === "share") { next.sharedMessage = session.proposal.message; next.lastSharedAt = Date.now(); }
      break;
    case "clear": next.sharedMessage = null; break;
    case "close": next.closed = true; next.sharedMessage = null; break;
  }
  return next;
}
