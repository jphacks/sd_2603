import { generateObject } from "ai";
import { MeetingAgendaSchema, type MeetingAgenda } from "./agenda.ts";
import { AgendaError } from "./document.ts";

const INSTRUCTIONS = [
  "あなたは会議のアジェンダ編集者です。",
  "入力は議事録、メモ、またはチャットです。",
  "今日の会議で決めることと、各議題が終わったと分かる状態だけを抜き出してください。",
  "過去の経緯、参加者、雑談は goal に混ぜないでください。",
  "items は 1 件から 8 件にしてください。入力にそれより多くあっても、今日決めるものに絞って 8 件までにしてください。",
].join("");

export async function organizeAgenda(source: string): Promise<MeetingAgenda> {
  if (process.env.ALLOW_PAID_AI !== "true") {
    throw new AgendaError("config", "有料AIが無効です");
  }
  const model = process.env.AGENDA_MODEL || "anthropic/claude-haiku-5.5";
  try {
    const { object } = await generateObject({
      model,
      schema: MeetingAgendaSchema,
      schemaName: "MeetingAgenda",
      prompt: `${INSTRUCTIONS}\n\n入力:\n${source}`,
    });
    return MeetingAgendaSchema.parse(object);
  } catch (error) {
    if (error instanceof AgendaError) throw error;
    throw new AgendaError("model", "アジェンダを整理できません");
  }
}
