import { controlAccessError } from "@/lib/recall/controller";
import { createJevProbe } from "@/lib/monitor/probe";

const probe = createJevProbe();
export async function POST(request: Request) {
  const denied = controlAccessError(request, process.env.RECALL_CONTROL_TOKEN);
  if (denied) return denied;
  const result = await probe();
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
