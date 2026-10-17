import { judge } from "@/lib/judge";
import { meetingFeed } from "@/lib/recall/feed.mjs";
import { joinMeeting, recallFailure, recallIo } from "@/lib/recall/meeting.mjs";

export async function POST(request: Request) {
  let meetingUrl = "";
  let agenda = "";
  try {
    const payload: unknown = await request.json();
    if (payload && typeof payload === "object") {
      if ("meetingUrl" in payload) meetingUrl = String(payload.meetingUrl ?? "");
      if ("agenda" in payload) agenda = String(payload.agenda ?? "");
    }
  } catch {
    return Response.json(
      { error: "会議 URL は https:// で始めてください。" },
      { status: 400 },
    );
  }

  try {
    const joined = await joinMeeting(recallIo(), meetingUrl);
    meetingFeed(judge).remember(joined.id, agenda);
    return Response.json(joined);
  } catch (error) {
    const failure = recallFailure(error);
    return Response.json(failure.body, { status: failure.status });
  }
}
