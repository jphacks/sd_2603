import { z } from "zod";
import { MAX_MATERIAL_BYTES, MAX_MATERIAL_UPLOADS, ingestJoinMaterials } from "@/lib/agenda/materials";

const BotIdSchema = z.string().uuid();

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "入力が正しくありません" }, { status: 400 });
  }

  const botId = String(form.get("botId") ?? "");
  if (!BotIdSchema.safeParse(botId).success) {
    return Response.json({ error: "ボットが確認できません" }, { status: 400 });
  }

  const files = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || !entry.name) continue;
    if (files.length >= MAX_MATERIAL_UPLOADS) break;
    files.push(entry.size > MAX_MATERIAL_BYTES
      ? { name: entry.name, bytes: null, tooLarge: true }
      : { name: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) });
  }

  const result = await ingestJoinMaterials({ botId, files });
  return Response.json({ saved: result.saved, items: result.items });
}
