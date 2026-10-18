# Recall.ai camera card control

The visual-only MVP uses Recall.ai's [Output Video endpoint](https://docs.recall.ai/docs/output-video-in-meetings) to place a static JPEG in the bot's camera stream. Google Meet supports this endpoint. It sends a 1280×720 card when the judge returns `INTERVENE`. The card shows AIDA's face from `lib/brand/faces.ts` (the same shapes as `docs/brand/`) on white: the redirect face with 「agenda」に戻りませんか？ for an off-agenda decision, or the nudge face with a prompt to organize the discussion when it is stalled. The idle card shows only the watching face. Faces and text stay inside the centered 4:3 area so Meet's tile cropping does not cut them. An agenda that does not fit one line wraps to two lines and is cut to 15 characters; the full agenda is still passed to the judge. Text is drawn as outlines from the bundled Noto Sans JP Bold (`lib/brand/fonts/`, SIL OFL), so the card does not depend on fonts installed on the server; `next.config.ts` adds the font to the `/api/recall/video` trace. `WAIT` and `SILENCE` do not update the camera. An explicit idle request restores the quiet card.

Configure `RECALL_API_KEY`, `RECALL_REGION` (`us-east-1`, `us-west-2`, `eu-central-1`, or `ap-northeast-1`), and a random `RECALL_CONTROL_TOKEN` of at least 32 characters on the server. Never expose either secret to a browser. The region must match the bot's Recall workspace. The bot must already be in the Meet call; creating or joining it is outside this endpoint. The `judge` mode below is a manual orchestration hook, not a bot-joining or transcription pipeline. Its caller must detect utterance boundaries and serialize requests per bot; this manual mode cannot infer speaking state or prevent older concurrent decisions from being shown last. The judge applies a 60-second intervention cooldown, but the manual caller must track the last intervention time. Requests are capped at 12 KB. The automatic worker's guarded `evaluate`/`display` path is described separately below.

Internal POST `/api/recall/video` with `Authorization: Bearer <RECALL_CONTROL_TOKEN>`:

```json
{
  "mode": "judge",
  "botId": "00000000-0000-4000-8000-000000000000",
  "agenda": "次のリリース方針を決める",
  "transcript": ["案Aの費用を確認します", "案Bはどうですか", "映画の話に移っています"],
  "secondsSinceLastIntervention": 90
}
```

The response includes the judge result and `video: "off_agenda" | "stalled" | "unchanged"`. To return to the quiet card after the intervention has been observed, send `{ "mode": "idle", "botId": "..." }` to the same endpoint. Do not automatically reset immediately on a `WAIT` or `SILENCE` response, because that can erase a card while the facilitator is still speaking. The caller owns the display duration and may send `idle` after speech or a timer. The [always-on transcription worker](REALTIME_TRANSCRIPTION.md) restores idle automatically eight seconds after a successful card; this manual endpoint itself does not own a background timer. Do not mix independent manual updates with the worker for the same bot, because only the worker's own requests share its serialized display/restore queue.

This path cannot be used while Recall.ai [Output Media](https://docs.recall.ai/docs/stream-media) is active. Output Media renders a webpage and is the stronger path for synchronized low-latency speech and animation, but cannot be combined with Output Video. This MVP does not send TTS or join a meeting. Recall.ai's final recording does not include the bot's own camera video, so confirm actual visibility in a live Google Meet session.

## Deferred automatic display

The transcription worker uses separate `evaluate` and `display` modes rather than the manual `judge` mode. Evaluation may run while speech and later transcription are still active. Its response includes a server-issued `recommendationId`; the worker sends that identifier at the top level of its subsequent `display` request together with `agenda`, `agendaVersion`, `generation`, `requestId`, and `result`.

The identifier is valid for 20 seconds, is bound to the bot and agenda snapshot, and is invalidated when a newer evaluation begins. The server uses its stored decision, not a caller-supplied action or manual flag. Immediately before camera output it rechecks the current agenda, worker quiet/pending state, device mute, and successful-output cooldown. The existing trusted device manual override retains its mute/cooldown bypass; it never bypasses the quiet/agenda checks. A cancelled or superseded request returns HTTP 409 without output or a cooldown event.

Recommendation authorization, device state, and agenda versions are process-local. Evaluation and display must reach the same Next.js process; restart invalidates pending identifiers. Multiple Vercel instances require a shared authorization/state store before this path is production-ready. Keep calls serialized per bot and do not combine independent manual camera control with the worker.
