import { readFile } from "node:fs/promises";
import { RecallCliError, localRecallIo, removeBot, sendBot } from "@/scripts/recall.mjs";
import { monitorStore } from "@/lib/monitor/store";
import { authorizedControl } from "@/lib/recall/controller";

// A bot left over from the previous meeting (still recorded, or removed from Meet
// directly) would block this join. Leave it first, then give the audio worker a
// moment to release its connection.
async function leavePreviousBot(io: ReturnType<typeof localRecallIo>) {
  let id = "";
  try {
    const state = JSON.parse(await readFile(io.statePath, "utf8")) as { id?: unknown };
    id = typeof state.id === "string" ? state.id : "";
  } catch {
    return;
  }
  if (!id) return;
  const result = await removeBot(io, id);
  if (!result.left) throw new RecallCliError("前のボットを退出できませんでした。退出してから入室してください。", { status: 409 });
  monitorStore.deactivate(id);
  if (process.env.ENABLE_REALTIME_TRANSCRIPTION !== "true") return;
  const port = Number(process.env.RECALL_AUDIO_PORT ?? 8787);
  for (let attempt = 0; attempt < 20; attempt++) {
    const ready = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
      .then((response) => response.ok, () => false);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function POST(request: Request) {
  if (!authorizedControl(request, process.env.RECALL_CONTROL_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let meetingUrl = "";
  let agenda = "";
  try {
    const payload: unknown = await request.json();
    if (payload && typeof payload === "object" && "meetingUrl" in payload) {
      meetingUrl = String(payload.meetingUrl ?? "");
      if ("agenda" in payload) agenda = String(payload.agenda ?? "");
    }
  } catch {
    return Response.json({ error: "会議 URL は https:// で始めてください。" }, { status: 400 });
  }

  try {
    const io = localRecallIo();
    await leavePreviousBot(io);
    const sent = await sendBot(meetingUrl, io, agenda);
    monitorStore.activate(sent.id, meetingUrl);
    return Response.json(sent);
  } catch (error) {
    if (error instanceof RecallCliError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const status =
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 502;
    const message = error instanceof Error ? error.message : "入室に失敗しました";
    return Response.json({ error: message }, { status });
  }
}
