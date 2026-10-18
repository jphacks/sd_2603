# Google Meet audio → live transcription → Jev → Recall video

This is a local, single-host prototype. The existing Meet URL form owns bot creation and leave. The separate, always-on Node worker receives that same bot's mixed audio. It streams 16 kHz Recall PCM (resampled continuously to 24 kHz) to `openai/gpt-realtime-whisper` through AI Gateway. Only final transcript events enter the bounded meeting context. The worker evaluates new finalized context during speech, at most once every ten seconds and with only one evaluation in flight. Display is a separate step: it waits for roughly 1.5 seconds without voiced audio and for pending recognition to finish. Partial transcripts are provisional and never trigger a decision or card.

The first utterance starts streaming immediately. About 1.2 seconds of silence, or ten seconds of continuous audio, closes its input so recognition can finalize without ending the meeting; later audio remains buffered in order while that final is pending. Pending audio blocks display, not evaluation of already finalized context. Normal empty recognitions are skipped; missing finals, oversized buffers, and other failures stop processing without a paid retry. Jev still waits for at least three final transcript entries, so one or two recognized segments alone do not produce a paid decision. The shorter ten-second segment limit allows continuous speech to reach that minimum without artificial pauses. Its real-provider transcription quality and cost impact have not yet been measured in Meet.

Automatic audio decisions initially use the explicit agenda entered when joining. Before each evaluation the worker obtains the same bot's latest organized agenda and its content-bound generation from the authenticated local video API. Uploaded text materials and configured Meet chat updates therefore feed both automatic and manual decisions; successful sources still append within the existing five-agenda/2,000-character limit, not a new active-topic selector. While a recognized source is being fetched or organized, evaluation/display is cancelled safely. Even a failed update invalidates old recommendations while retaining the last saved agenda. A changed generation clears the held off-agenda recommendation, including when the text is identical. The current batch remains in bounded transcript history and no retry is scheduled without a new final. A failed agenda lookup stops processing rather than falling back to a stale agenda.

The API checks the agenda generation before and after the model call and immediately before output, including after rendering and the asynchronous quiet check. Superseded model results never replace the monitor's latest recommendation. Worker evaluations feed the score monitor under the bot ID; only a successful video output records an actual intervention and its cooldown. If a chat webhook is configured alongside audio, both the audio WebSocket and chat webhook are included in the same bot's realtime endpoints. The agenda store is process-local: chat/materials and video routes must share the same app process. Restarts lose organized agendas, and multiple app instances are not supported without durable shared state. Once a Recall output request has begun, a subsequent agenda update cannot atomically retract that external side effect; the generation checks cover the period up to the send boundary, not that network race.

The worker applies a separate display safety policy: an off-agenda card requires two consecutive valid `INTERVENE` recommendations with the same reason, and the second evaluation must include newly accepted final conversation. A single recommendation is held, not rewritten into a different model action. Re-evaluating the same history or merely starting audio cannot confirm it. New finals invalidate a pending display and require a fresh evaluation; the first off-agenda vote can still be confirmed by a later final within its twenty-second lifetime. Held display recommendations expire twenty seconds after evaluation starts. Continuing valid off-agenda recommendations renew confirmation, rather than relying on an indefinitely old first vote. Stale evaluations and cancelled displays do not confirm it. A valid non-intervention, changed reason, successful display, or stopped session clears confirmation. Stalled-discussion cards do not need this extra confirmation. The quiet check, 60-second judge cooldown, and eight-second image restore remain independent. Final entries are ASR segments, not guaranteed speaker turns, and this conservative policy can delay or miss a useful off-agenda nudge; it is not a claim that model accuracy has improved. The explicit manual `mode: "judge"` endpoint does not apply this worker-only confirmation policy.

The API also issues a short-lived, bot/agenda-bound recommendation identifier and uses its server-owned result when displaying. A newer evaluation invalidates the old identifier, and the display guard rechecks current device mute and successful-output cooldown as well as agenda and worker quiet/pending state. A caller-supplied manual flag cannot grant an override. This authorization store is process-local, so evaluation and display must reach the same Next.js instance; restart discards pending recommendations.

After a successful intervention image response, the worker waits eight seconds and sends an authenticated `idle` request automatically, without another judge call. This image-only restore does not wait for silence. The worker serializes its display and restore operations; a newer successful card replaces the older deadline, and a cancelled card does not cancel the existing deadline. Closing the audio session or stopping the worker cancels pending timers and aborts its in-flight video requests. A restore failure stops processing without a retry, so the operator may still need to restore the card manually or leave the bot. The timer lives in the always-on worker, not in a Vercel Function.

The worker must be the only display owner for its bot. Do not invoke manual `judge`, `display`, or `idle` operations concurrently for that same bot: independent API callers do not share the worker's display queue or timer epochs. The manual `mode: "judge"` endpoint alone does not schedule automatic restoration. Worker/process crashes cannot guarantee a final idle image; the existing leave operation remains the cleanup path.

## Local setup

Use Node 24 (the exact local/CI version is in `.nvmrc` and `.node-version`) and install dependencies with `npm ci`. The app, worker, CI and Node type definitions target the same major version. App npm commands and worker startup fail early on other Node majors; restart old terminals after switching runtimes. In `.env.local`, configure:

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
3. Speak naturally or share one continuously playing audio tab. Do not pause playback every fifteen seconds to manufacture evaluation opportunities: finalized ten-second segments now permit background evaluation. Only the actual card waits for a natural quiet window and completed recognition. Use the same UI to leave. Stop the worker after the bot has left.

When audio mode is disabled, the existing join still creates a muted bot without a recording configuration; join/leave still requires the control token. When audio mode is enabled, `AI_PROVIDER=jev` is required and the worker or missing secrets cause join to fail before bot creation. A worker failure stops processing and does not retry paid API calls or create another bot; leave the bot from the UI and restart the worker before trying again. If no audio WebSocket arrives within eleven minutes of bot creation (allowing for the nine-minute waiting-room timeout), the worker marks itself unhealthy and asks the operator to leave the bot. CLI joining in audio mode requires an explicit `MEETING_AGENDA` environment variable; the UI uses its agenda input instead.

The worker and Next app must share `.recall/bots/<botId>.json` on one host (legacy `.recall/current.json` is still accepted). Each meeting has an independent audio connection, transcript, agenda, gate, cooldown and restore timer. The worker accepts up to `RECALL_MAX_AUDIO_CONNECTIONS` (default 32, maximum 128); one meeting failing or disconnecting does not halt other meetings. Failed bot IDs are not automatically retried. This design does not run end-to-end from a Vercel deployment alone. A Vercel-hosted WebSocket design is possible, but would require durable session state, bounded connection lifetime handling, and reconnect orchestration. It is not implemented here. No raw audio or transcript files are stored by this prototype; avoid enabling verbose provider telemetry for sensitive meetings. Recall's own retention depends on account configuration.

This is a best-effort speech boundary: a new speaker can start during network latency after the worker's last quiet-state check. Test this with real meeting audio before presenting the behavior as interruption-safe. The current worker stops on transport failure instead of replaying ambiguous transcript/video operations.

The no-audio watchdog only covers a WebSocket that never connects. A connected WebSocket with no speech may simply mean everyone is muted; this prototype does not infer failure from silence. Its health endpoint therefore does not prove transcription quality or Gateway acceptance. Monitor the worker and verify at least one real final transcript in a test meeting before relying on automatic intervention.

Official references: [Recall mixed audio](https://docs.recall.ai/docs/how-to-get-mixed-audio-real-time), [AI Gateway streaming transcription](https://vercel.com/docs/ai-gateway/modalities/speech-to-text), [AI SDK transcription events and provider options](https://ai-sdk.dev/docs/ai-sdk-core/transcription).


## 会議中の判定グラフ

参加画面で会議URLを送ると、返されたRecall Bot IDをMTG IDとして、その会議のJev判定グラフを参加画面内に表示します。「この会議の判定グラフを別画面で開く」から `/monitor?session=<Bot ID>` も開けます。議案書の保存に失敗した場合も、Botの参加に成功していればモニターは利用できます。

`/monitor` を先に開いておくと、参加画面で送信した会議を自動表示します。CLIから参加した場合は最初の判定で自動選択します。別の会議に参加すると表示対象を切り替え、前の会議の値を混ぜません。MTG IDの入力欄で特定のBot IDを指定すると、その会議に固定できます。退出が成功すると自動表示を待機状態へ戻します。

会議判定経路 `/api/recall/video` の `judge` / `evaluate` が既存のJev結果を保存し、画面は2秒間隔で結果を読み取ります。表示のための追加Jev実行や音声送信はありません。まだ判定がない間は「実スコア未取得」と表示し、クールダウン中は最後の実スコアを保持します。

判定するアプリとモニターAPIは同じアプリプロセスの保存先を参照する必要があります。既存のストアはメモリ内のため、ローカルのアプリで行った判定が別のVercelデプロイへ自動転送されることはありません。複数インスタンス間の共有には別途共有ストアが必要です。


モニターの入力欄は、Google Meetの会議URL、会議コード（`abc-defg-hij`）、参加後のBot IDを受け付けます。参加画面で登録した会議URL、またはCLIの `.recall/current.json` のURLとBot IDの対応を使い、対象会議の判定を取得します。会議URLに付いたクエリは照合時に除きます。対応する参加情報がまだない場合は待機し、別の会議のスコアは表示しません。URLの入力自体ではBotを入室させません。


## ブラウザの入退室認証

既定では操作トークンの入力が必要です。`BROWSER_CONTROL_ENABLED=true` を明示した環境では参加・退出をServer Actionsで実行し、サーバー側の `RECALL_CONTROL_TOKEN` を内部APIへ渡します。ブラウザにはトークンを返しません。既存のREST APIと音声ワーカーのBearer認証は維持します。

この設定を有効にすると、参加画面へアクセスできる人にBotの入退室操作を許可する運用になります。必要ならVercel Deployment Protectionなどで画面へのアクセスを制限してください。既定値は無効で、環境変数の設定変更後には再デプロイが必要です。

stagingでは利用者の承認に基づき、CIデプロイで `BROWSER_CONTROL_ENABLED=true` を設定します。mainとfeatureは従来の操作トークン入力方式のままです。


## 複数ユーザーによる同時利用

Vercelの `RECALL_API_KEY` は共通の1つを使用し、利用者Aと利用者Bはそれぞれの会議へ別のBotを参加させます。各利用者は1会議を操作するUIを使います。全員の会議を並べる選択画面はありません。「参加状況を確認」と再読み込みでは、その利用者の会議だけをRecallから復元します。退出はその利用者が参加させたBot IDだけを対象にします。会議の復元と退出はVercelの一時ファイルや同じFunctionインスタンスに依存しません。

ログイン機能がないため、利用者は署名付きHttpOnly Cookieでブラウザごとに区別します。有効期限は30日、SecureはVercelで有効、SameSite=Laxです。署名にはサーバー側の `RECALL_CONTROL_TOKEN` を使用し、APIキーや操作トークンをブラウザへ渡しません。Cookie削除、別のブラウザ・端末、または署名キーの変更後は同じ利用者として復元できません。アカウントを使った端末間の引き継ぎは別途ログイン基盤が必要です。同一ブラウザ内のタブは同じ利用者です。

Recall metadata `facilitator` と `owner` にアプリ環境と匿名セッションの対応を保存します。一覧はサーバーで両方を照合し、退出では対象Botを再取得して所有者も照合します。`BROWSER_CONTROL_ENABLED=true` の環境では、モニターのURL・Bot IDを指定しても別の利用者の判定を読み取れません。これはステージングの公開UI利用者を分離する仕組みで、ログイン認証やRecallの利用枠を置き換えるものではありません。

環境の値は `meeting-facilitator:<RECALL_MEETING_SCOPE または VERCEL_ENV または local>` です。同じRecallキーを複数の独立プロジェクトで共有するときは、環境ごとに異なる `RECALL_MEETING_SCOPE` を設定してください。以前のmetadataなしBotは復元できないため、更新前のBotが残っている場合はMeetまたはRecall管理画面から退出させてください。同時参加の実上限はRecallワークスペースの利用枠にも依存します。REST利用者もCookieを保持し、退出には `{ "botId": "..." }` を送信します。

常駐音声ワーカーは会議ごとに音声・アジェンダ・判定・クールダウン・表示タイマーを分離し、1会議の障害で他の会議を停止しません。`RECALL_MAX_AUDIO_CONNECTIONS` の既定値は32（設定範囲1〜128）です。ただし、Vercel単体で常駐音声ワーカーは動かず、既存のJevスコア・アジェンダ・介入承認メモリストアもFunctionインスタンス間では共有されません。この変更は共有DBの導入や音声ワーカーのクラウド常駐化を含みません。

検証は `npm test` と `npm run test:meeting-regression`。ビルド後に `node scripts/check-multi-meeting-ui.mjs` を実行すると、独立した2つのブラウザで共通キーによる参加、利用者ごとのグラフ、他人の閲覧・退出の拒否、A退出後のBの継続を確認します。このブラウザ検証はRecallをループバックの代替サーバーへ接続し、実Botや有料AIを作成しません。Playwrightは別途利用可能な環境で実行してください。


## 音声自動判定の設定表示

モニターには「音声自動判定（設定）: 有効 / 無効」を表示します。これは `ENABLE_REALTIME_TRANSCRIPTION` の設定値であり、実際の音声受信やワーカー稼働を確認した結果ではありません。接続確認ボタン・疎通確認API・確認用の有料Jev呼び出しはありません。

有効な場合、ワーカーが音声を受信し、確定した文字起こしを蓄積して既存のJev判定処理へ渡します。Jevの実行には確定テキスト3件以上が必要で、評価間隔は最短10秒、実介入後は60秒のクールダウンがあります。部分文字起こしだけでは判定しません。判定結果はモニターへ反映し、実際の介入表示は発言の切れ目を待ちます。

無効の場合、Botが入室しても音声からの自動判定は始まりません。有効でも常駐ワーカー・音声受信・文字起こし・Jevの設定が整っている必要があります。モニターAPIの応答済み・判定待ち・表示権限エラーはグラフの既存の状態表示で区別します。
