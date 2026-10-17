import { judge } from "@/lib/judge";
import { meetingFeed } from "@/lib/recall/feed.mjs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return Response.json({ error: "bot id の形式が不正です" }, { status: 400 });
  }
  return Response.json(meetingFeed(judge).snapshot(id));
}
