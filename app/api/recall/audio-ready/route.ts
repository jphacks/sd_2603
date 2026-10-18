import { authorizedControl } from "@/lib/recall/controller";

export async function GET(request: Request) {
  if (!authorizedControl(request, process.env.RECALL_CONTROL_TOKEN)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ready = process.env.ENABLE_REALTIME_TRANSCRIPTION === "true" && process.env.AI_PROVIDER === "jev" && process.env.ALLOW_PAID_AI === "true" && Boolean(process.env.AI_GATEWAY_API_KEY) && !process.env.RECALL_AUDIO_WORKER_URL && process.env.BROWSER_CONTROL_ENABLED !== "true";
  return Response.json({ ready }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
