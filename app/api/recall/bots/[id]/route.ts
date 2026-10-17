import { readMeeting, recallFailure, recallIo } from "@/lib/recall/meeting.mjs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const meeting = await readMeeting(recallIo(), id);
    return Response.json(meeting);
  } catch (error) {
    const failure = recallFailure(error);
    return Response.json(failure.body, { status: failure.status });
  }
}
