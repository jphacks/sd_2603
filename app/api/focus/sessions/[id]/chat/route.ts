import { loadSession } from "@/lib/focus/store";
import { apiError, bearer, privateJson } from "@/lib/focus/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await loadSession(id, bearer(request));
    const base = process.env.FOCUS_PUBLIC_BASE_URL;
    return privateJson({
      webhookPath: `/api/recall/chat/${id}`,
      webhookUrl: base ? new URL(`/api/recall/chat/${id}`, base).href : null,
      recallKeyConfigured: Boolean(process.env.RECALL_API_KEY),
      verificationConfigured: Boolean(process.env.RECALL_WORKSPACE_VERIFICATION_SECRET),
      googleDriveConfigured: Boolean(process.env.GOOGLE_DRIVE_ACCESS_TOKEN),
    });
  } catch (error) { return apiError(error); }
}
