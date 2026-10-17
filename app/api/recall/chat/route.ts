import { receiveChatWebhook } from "@/lib/agenda/receive";

export async function POST(request: Request) {
  const result = await receiveChatWebhook({
    payload: await request.text(),
    headers: request.headers,
    secret: process.env.RECALL_WEBHOOK_SECRET ?? "",
  });
  return Response.json(result.body, { status: result.status });
}
