import { z } from "zod";

export const AGENDA_BLOCK_LIMIT = 900;
export const AGENDA_CHAR_LIMIT = 2000;
export const MAX_AGENDAS = 5;
export const SOURCE_CHAR_LIMIT = 8_000;

export const MeetingAgendaSchema = z.object({
  goal: z.string().trim().min(1).max(40).describe("この会議で決めること。過去の経緯は入れない"),
  items: z.array(z.object({
    title: z.string().trim().min(1).max(24).describe("議題名"),
    outcome: z.string().trim().min(1).max(40).describe("その議題が終わったと分かる状態"),
  })).min(1).max(8),
});

export type MeetingAgenda = z.infer<typeof MeetingAgendaSchema>;

const DOCUMENT_ID = /^\/document\/d\/([A-Za-z0-9_-]{10,128})(?:\/|$)/;

export function googleDocExportUrl(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.hostname !== "docs.google.com") return null;
  const id = url.pathname.match(DOCUMENT_ID)?.[1];
  if (!id) return null;
  return `https://docs.google.com/document/d/${id}/export?format=txt`;
}

export type AgendaSource =
  | { kind: "text"; text: string }
  | { kind: "document"; pageUrl: string; exportUrl: string };

export function agendaSource(text: string): AgendaSource | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]{10,128}/);
  if (match) {
    const exportUrl = googleDocExportUrl(match[0]);
    if (!exportUrl) return null;
    return { kind: "document", pageUrl: match[0], exportUrl };
  }
  if (!trimmed.includes("アジェンダ")) return null;
  return { kind: "text", text: trimmed.slice(0, SOURCE_CHAR_LIMIT) };
}

export function renderAgenda(agenda: MeetingAgenda): string {
  const goal = agenda.goal.trim();
  const items = agenda.items.slice(0, 8);
  for (let kept = items.length; kept >= 0; kept -= 1) {
    const lines = [
      `目的: ${goal}`,
      ...items.slice(0, kept).map((item, index) => `${index + 1}. ${item.title.trim()} — ${item.outcome.trim()}`),
    ];
    const body = lines.join("\n");
    if (body.length <= AGENDA_BLOCK_LIMIT) return body;
  }
  return `目的: ${goal}`.slice(0, AGENDA_BLOCK_LIMIT);
}

export function renderAgendas(agendas: MeetingAgenda[]): string {
  let pieces = agendas.slice(-MAX_AGENDAS).map((agenda) => renderAgenda(agenda));
  while (pieces.length > 1 && pieces.join("\n\n").length > AGENDA_CHAR_LIMIT) {
    pieces = pieces.slice(1);
  }
  const body = pieces.join("\n\n");
  return body.length <= AGENDA_CHAR_LIMIT ? body : body.slice(0, AGENDA_CHAR_LIMIT);
}

const storeHost = globalThis as typeof globalThis & { __meetingAgendas?: Map<string, MeetingAgenda[]> };
const agendas = storeHost.__meetingAgendas ?? new Map<string, MeetingAgenda[]>();
storeHost.__meetingAgendas = agendas;

export function saveAgenda(botId: string, agenda: MeetingAgenda): string {
  const next = [...(agendas.get(botId) ?? []), MeetingAgendaSchema.parse(agenda)].slice(-MAX_AGENDAS);
  agendas.set(botId, next);
  return renderAgendas(next);
}

export function getAgenda(botId: string): string | null {
  const stored = agendas.get(botId);
  if (!stored || stored.length === 0) return null;
  return renderAgendas(stored);
}

export function agendaForJudge(botId: string, requested: string): string {
  return getAgenda(botId) ?? requested;
}

export function clearAgendas() {
  agendas.clear();
}
