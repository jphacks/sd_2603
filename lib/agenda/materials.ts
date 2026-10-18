import {
  MAX_AGENDAS,
  SOURCE_CHAR_LIMIT,
  beginAgendaUpdate,
  getAgenda,
  saveAgenda,
  type MeetingAgenda,
} from "./agenda.ts";
import { AgendaError } from "./document.ts";
import { organizeAgenda } from "./organize.ts";

export const MAX_MATERIAL_BYTES = 100_000;
export const MAX_MATERIAL_UPLOADS = MAX_AGENDAS + 1;

export type MaterialFile = {
  name: string;
  bytes: Uint8Array | null;
  tooLarge?: boolean;
};

export type MaterialItemResult = {
  name: string;
  saved: boolean;
  message: string | null;
};

type MaterialSource = {
  name: string;
  load: () => Promise<string>;
};

function fileName(name: string) {
  const base = name.split(/[/\\]/).pop()?.trim() || "ファイル";
  return base;
}

function readTextFile(file: MaterialFile): string {
  const name = fileName(file.name);
  if (!/\.(txt|md)$/i.test(name)) throw new AgendaError("document", "読めませんでした");
  if (file.tooLarge || !file.bytes || file.bytes.byteLength > MAX_MATERIAL_BYTES) {
    throw new AgendaError("document", "ファイルが大きすぎます");
  }
  if (file.bytes.includes(0)) throw new AgendaError("document", "読めませんでした");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes).replace(/^\uFEFF/, "").trim();
  } catch {
    throw new AgendaError("document", "読めませんでした");
  }
  if (!text) throw new AgendaError("document", "読めませんでした");
  return text;
}

function itemMessage(error: unknown) {
  if (error instanceof AgendaError && error.kind === "document") return error.message;
  return "整理できませんでした";
}

export async function ingestJoinMaterials(
  input: {
    botId: string;
    files?: MaterialFile[];
  },
  dependencies: {
    organize?: (source: string) => Promise<MeetingAgenda>;
  } = {},
): Promise<{ saved: number; agenda: string | null; items: MaterialItemResult[] }> {
  const organize = dependencies.organize ?? organizeAgenda;
  const sources: MaterialSource[] = [];
  for (const file of input.files ?? []) {
    sources.push({
      name: fileName(file.name),
      load: async () => readTextFile(file),
    });
  }

  const items: MaterialItemResult[] = [];
  let saved = 0;
  for (const [index, source] of sources.entries()) {
    if (index >= MAX_AGENDAS) {
      items.push({ name: source.name, saved: false, message: "5件までです" });
      continue;
    }
    const finishUpdate = beginAgendaUpdate(input.botId);
    try {
      const raw = await source.load();
      saveAgenda(input.botId, await organize(raw.slice(0, SOURCE_CHAR_LIMIT)));
      saved += 1;
      items.push({ name: source.name, saved: true, message: null });
    } catch (error) {
      console.error("Join material skipped:", error instanceof Error ? error.name : "error");
      items.push({ name: source.name, saved: false, message: itemMessage(error) });
    } finally {
      finishUpdate();
    }
  }
  return { saved, agenda: getAgenda(input.botId), items };
}
