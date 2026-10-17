# Google Meet audio → live transcription → Jev → Recall video

This is a local, single-host prototype. The existing Meet URL form owns bot creation and leave. The separate, always-on Node worker receives that same bot's mixed audio. It streams 16 kHz Recall PCM (resampled continuously to 24 kHz) to `openai/gpt-realtime-whisper` through AI Gateway. Only final transcript events enter the bounded meeting context. After roughly 1.5 seconds without voiced audio, the worker requests a Jev decision and, if speech has not resumed, asks the existing Recall video endpoint to display the card. Partial transcripts are provisional and never trigger a card.

The first utterance starts streaming immediately. About 1.2 seconds of silence closes its input so that recognition can finalize without ending the meeting; later utterances remain buffered in order while that final is pending. Pending audio blocks both evaluation and display. Normal empty recognitions are skipped; missing finals, oversized buffers, and other failures stop processing without a paid retry. Jev waits for at least three final transcript entries, so one or two recognized utterances alone do not produce a paid decision.

After a successful intervention image response, the worker waits eight seconds and sends an authenticated `idle` request automatically, without another judge call. This image-only restore does not wait for silence. The worker serializes its display and restore operations; a newer successful card replaces the older deadline, and a cancelled card does not cancel the existing deadline. Closing the audio session or stopping the worker cancels pending timers and aborts its in-flight video requests. A restore failure stops processing without a retry, so the operator may still need to restore the card manually or leave the bot. The timer lives in the always-on worker, not in a Vercel Function.

The worker must be the only display owner for its bot. Do not invoke manual `judge`, `display`, or `idle` operations concurrently for that same bot: independent API callers do not share the worker's display queue or timer epochs. The manual `mode: "judge"` endpoint alone does not schedule automatic restoration. Worker/process crashes cannot guarantee a final idle image; the existing leave operation remains the cleanup path.

## Local setup

Use Node 24 and install dependencies with `npm ci`. In `.env.local`, configure:

```dotenv
AI_PROVIDER=jev
ALLOW_PAID_AI=true
AI_GATEWAY_API_KEY=your-gateway-key
ENABLE_REALTIME_TRANSCRIPTION=true
RECALL_API_KEY=your-recall-key
RECALL_REGION=ap-northeast-1
RECALL_CONTROL_TOKEN=a-random-secret-at-least-32-characters
RECALL_AUDIO_TOKEN=a-different-random-secret-at-least-32-characters
RECALL_AUDIO_PUBLIC_URL=wss://your-public-tunnel.example
RECALL_AUDIO_PORT=8787
VIDEO_CONTROL_URL=http://127.0.0.1:3000/api/recall/video
```

Keep both tokens server-side except that the operator enters `RECALL_CONTROL_TOKEN` into the UI's password field for join/leave. Do not paste secrets into meeting chat or commit them. The audio token is embedded in Recall's private WebSocket endpoint URL and must not be logged. Configure an HTTPS/WSS tunnel to local port 8787; the worker binds only to `127.0.0.1`. The tunnel must preserve WebSocket upgrades.

1. Start the app (`npm run dev`) and the worker (`node scripts/recall-transcription.mjs`) in separate terminals, from the same repository directory. The worker's `/health` endpoint must answer before join.
2. In the app, enter the Meet URL, an explicit agenda, and the control token. Join once, then admit `MTG Lab` in Meet.
3. Speak naturally. The worker waits for a final transcript and a quiet window before requesting intervention. Use the same UI to leave. Stop the worker after the bot has left.

When audio mode is disabled, the existing join still creates a muted bot without a recording configuration; join/leave still requires the control token. When audio mode is enabled, `AI_PROVIDER=jev` is required and the worker or missing secrets cause join to fail before bot creation. A worker failure stops processing and does not retry paid API calls or create another bot; leave the bot from the UI and restart the worker before trying again. If no audio WebSocket arrives within eleven minutes of bot creation (allowing for the nine-minute waiting-room timeout), the worker marks itself unhealthy and asks the operator to leave the bot. CLI joining in audio mode requires an explicit `MEETING_AGENDA` environment variable; the UI uses its agenda input instead.

The worker and Next app must share `.recall/current.json` on one host. This design does not run end-to-end from a Vercel deployment alone. A Vercel-hosted WebSocket design is possible, but would require durable session state, bounded connection lifetime handling, and reconnect orchestration. It is not implemented here. No raw audio or transcript files are stored by this prototype; avoid enabling verbose provider telemetry for sensitive meetings. Recall's own retention depends on account configuration.

This is a best-effort speech boundary: a new speaker can start during network latency after the worker's last quiet-state check. Test this with real meeting audio before presenting the behavior as interruption-safe. The current worker stops on transport failure instead of replaying ambiguous transcript/video operations.

The no-audio watchdog only covers a WebSocket that never connects. A connected WebSocket with no speech may simply mean everyone is muted; this prototype does not infer failure from silence. Its health endpoint therefore does not prove transcription quality or Gateway acceptance. Monitor the worker and verify at least one real final transcript in a test meeting before relying on automatic intervention.

Official references: [Recall mixed audio](https://docs.recall.ai/docs/how-to-get-mixed-audio-real-time), [AI Gateway streaming transcription](https://vercel.com/docs/ai-gateway/modalities/speech-to-text), [AI SDK transcription events and provider options](https://ai-sdk.dev/docs/ai-sdk-core/transcription).
