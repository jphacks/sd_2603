import { leaveMeeting, recallFailure, recallIo } from "@/lib/recall/meeting.mjs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const left = await leaveMeeting(recallIo(), id);
    return Response.json(left);
  } catch (error) {
    const failure = recallFailure(error);
    return Response.json(failure.body, { status: failure.status });
  }
}
