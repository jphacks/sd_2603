export type CameraSource =
  | { kind: "url"; url: string }
  | { kind: "stream"; stream: MediaStream };

export type ChatSender = "self" | "bot" | "participant";

export type AgendaAttachment = {
  id: string;
  name: string;
  size: number;
  text: string;
};

export type ChatMessage = {
  id: string;
  sender: ChatSender;
  name: string;
  text: string;
  createdAt: string;
  attachments?: AgendaAttachment[];
};

export type ChatDraft = {
  text: string;
  attachments: AgendaAttachment[];
};
