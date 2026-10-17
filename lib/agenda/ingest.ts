import { AGENDA_CHAT_PROMPT, BOT_NAME } from "../../scripts/recall.mjs";
import {
  SOURCE_CHAR_LIMIT,
  agendaSource,
  getAgenda,
  saveAgenda,
  type MeetingAgenda,
} from "./agenda.ts";
import { fetchPublicDocument } from "./document.ts";
import { organizeAgenda } from "./organize.ts";

export type IngestResult = {
  updated: boolean;
  agenda: string | null;
  reason: "bot" | "ignored" | "kept" | "updated";
};

export async function ingestChatMessage(
  input: {
    botId: string;
    participantName: string | null;
    text: string;
  },
  dependencies: {
    fetch?: typeof fetch;
    organize?: (source: string) => Promise<MeetingAgenda>;
  } = {},
): Promise<IngestResult> {
  const previous = getAgenda(input.botId);
  const text = input.text.trim();
  if (input.participantName === BOT_NAME || text === AGENDA_CHAT_PROMPT) {
    return { updated: false, agenda: previous, reason: "bot" };
  }
  const source = agendaSource(text);
  if (!source) return { updated: false, agenda: previous, reason: "ignored" };
  try {
    const raw = source.kind === "text"
      ? source.text
      : await fetchPublicDocument(source.exportUrl, dependencies.fetch ?? fetch);
    const agenda = await (dependencies.organize ?? organizeAgenda)(raw.slice(0, SOURCE_CHAR_LIMIT));
    return { updated: true, agenda: saveAgenda(input.botId, agenda), reason: "updated" };
  } catch (error) {
    console.error("Agenda ingest skipped:", error instanceof Error ? error.name : "error");
    return { updated: false, agenda: previous, reason: "kept" };
  }
}
