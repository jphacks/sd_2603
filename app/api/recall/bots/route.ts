import { joinMeeting, recallFailure, recallIo } from "@/lib/recall/meeting.mjs";

export async function POST(request: Request) {
  let meetingUrl = "";
  try {
    const payload: unknown = await request.json();
    if (payload && typeof payload === "object" && "meetingUrl" in payload) {
      meetingUrl = String(payload.meetingUrl ?? "");
    }
  } catch {
    return Response.json(
      { error: "会議 URL は https:// で始めてください。" },
      { status: 400 },
    );
  }

  try {
    const joined = await joinMeeting(recallIo(), meetingUrl);
    return Response.json(joined);
  } catch (error) {
    const failure = recallFailure(error);
    return Response.json(failure.body, { status: failure.status });
  }
}
