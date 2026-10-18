import { RecallCliError, localRecallIo, sendBot } from "@/scripts/recall.mjs";
import { monitorStore } from "@/lib/monitor/store";
import { controlAccessError } from "@/lib/recall/controller";

export async function POST(request: Request) {
  const denied = controlAccessError(request, process.env.RECALL_CONTROL_TOKEN);
  if (denied) return denied;
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
    const sent = await sendBot(
      meetingUrl,
      localRecallIo(process.env, globalThis.fetch, { persistState: false }),
      agenda,
    );
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
