# Recall.ai camera card control

The visual-only MVP uses Recall.ai's [Output Video endpoint](https://docs.recall.ai/docs/output-video-in-meetings) to place a static JPEG in the bot's camera stream. Google Meet supports this endpoint. It sends a 1280×720 card when the judge returns `INTERVENE`, showing the configured agenda for an off-agenda decision or a distinct discussion-stalled prompt. The camera card displays up to 30 agenda characters on two lines; the full agenda is still passed to the judge. `WAIT` and `SILENCE` do not update the camera. An explicit idle request restores the quiet card.

Configure `RECALL_API_KEY`, `RECALL_REGION` (`us-east-1`, `us-west-2`, `eu-central-1`, or `ap-northeast-1`), and a random `RECALL_CONTROL_TOKEN` of at least 32 characters on the server. Never expose either secret to a browser. The region must match the bot's Recall workspace. The bot must already be in the Meet call; creating or joining it is outside this endpoint. This is a manual orchestration hook, not a bot-joining or transcription pipeline. Upstream integration must detect utterance boundaries and serialize requests per bot before invoking this endpoint; the route cannot infer speaking state or prevent older concurrent decisions from being shown last. The judge applies a 60-second intervention cooldown, but the caller must track the last intervention time. Requests are capped at 12 KB.

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
