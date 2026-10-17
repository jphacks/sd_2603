import type { MeetChatMessage } from "@/lib/recall/chat";

export type FocusProposal = {
  id: string;
  message: string;
  state: "pending" | "shared" | "deferred";
};

export type FocusNote = {
  id: string;
  text: string;
  createdAt: string;
};

export type FocusSession = {
  id: string;
  revision: number;
  title: string;
  agenda: string;
  notes: FocusNote[];
  proposal: FocusProposal | null;
  sharedMessage: string | null;
  lastSharedAt?: number | null;
  closed: boolean;
  expiresAt: number;
  recallBotId?: string | null;
  meetChat?: MeetChatMessage[];
};

export type FocusCredentials = {
  id: string;
  controlToken: string;
  cameraToken: string;
};

export type FocusCameraState = Pick<FocusSession, "title" | "sharedMessage" | "closed" | "revision">;

export type FocusAction =
  | { action: "agenda"; agenda: string }
  | { action: "note"; text: string; agenda?: string }
  | { action: "propose"; message: string }
  | { action: "share" | "defer"; proposalId: string }
  | { action: "clear" | "close" }
  | { action: "bindBot"; botId: string };
