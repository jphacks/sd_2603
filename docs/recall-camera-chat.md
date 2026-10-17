# Focus 操作パネルとボットのカメラ出力

`feature/recall-camera-chat` で実装。`staging` の `ffc09b4`（Recall入退室CLIを含む）をpullした状態が起点です。

### 現在のUI（設定パネルへ変更）

カメラ背景には提供された3枚を加工せず使用しています。青＝沈黙、オレンジ＝脱線、緑＝順調。設定の「カメラ背景のデモ」から切り替え可能で、ローカルプレビューとRecall用カメラページへ同じ状態を反映します。短い例文と「デモ」ラベルを表示し、自動判定とは区別します。初期表示は緑の順調デモです。APIキー不要で画面確認できますが、実会議への出力にはRecall接続が必要です。

右側は初期表示から「Focus設定」です。進行サポートの提案確認・共有・保留・手動提案入力・メモ表示は画面から外しました。Focusボタンは設定の開閉、×は設定を閉じる動作です。設定にはアジェンダ取得状態、RecallのWebhook／Bot接続、カメラ出力、任意の映像URL設定をまとめています。Meetからの自動アジェンダ取得とカメラ出力は維持し、既存の提案／Judge APIと旧部品は互換性のため残しています。以下の提案操作の説明は旧操作パネルの仕様で、現在の画面からは実行できません。

## 画面と動作

- `/meeting`：会議を準備し、右側のFocusパネルで提案を確認。中央はボットカメラのプレビューです。
- `/focus/camera/[id]#token=...`：Recallが描画する専用ページ。共有した提案だけを表示します。
- 「提案を入力する」または接続設定の「提案の表示を試す」で提案を作成。準備した提案は操作パネルだけに表示されます。
- 「あとで」で保留。メモ欄から再提案できます。「会議に共有」でカメラ表示を更新します。
- 「カメラの提案を閉じる」で待機表示へ戻ります。「サポート終了」で共有を消し、カメラ側も終了表示になります。Recallボットの退出は既存CLIで別途行います。
- アジェンダはGoogle Meetのチャットに投稿したDriveファイルリンクから自動で取り込みます。PDF／DOCX（5MB・PDF100ページ・本文20000文字以内）に対応。旧DOCと画像だけのPDF（OCR）は未対応です。アプリにはチャット履歴・手動編集欄・取り込みボタン・アジェンダ専用パネルを出しません。進行サポート内に取得状態だけを表示します。
- 「メモをもとに判定する」は既存Judgeを利用。`INTERVENE`でも提案は自分だけに表示し、共有には操作が必要です。共有後60秒のクールダウンを維持します。

画像の会議アプリ全体を置き換えるものではありません。会議の参加者映像はMeet等で表示し、Focusの専用ページをボットカメラに映します。Next.jsの操作パネルをMeet内の右サイドバーに直接入れるアドオン・拡張機能は含みません。操作パネルは別ウィンドウで会議と並べて使えます。

## ローカル確認

```bash
npm ci
npm run dev
```

`http://localhost:3000/meeting` で「会議を準備する」を押します。「接続設定 → 提案の表示を試す → 提案を準備する」で非公開提案を作成し、共有／保留を試せます。「接続設定 → カメラ表示を開く」で別タブの表示も確認できます。

初期状態では自動音声認識は行いません。Judgeの対象は手動入力したメモです。Botの文字起こしを取り込み、発言の切れ目で自動判定する処理は後続の接続対象です。状態を「待機中」と表示し、収音や認識が動作しているようには表示しません。

## Recallボットへの接続

既存の入退室CLIでBotを入室させ、そのBot IDを操作パネルへ入力します。入退室手順は `docs/recall-cli.md` を参照してください。今回の実装は新しいBotの作成や録画開始を行いません。

```dotenv
RECALL_API_KEY=your-recall-key
RECALL_REGION=ap-northeast-1
FOCUS_PUBLIC_BASE_URL=https://your-public-origin.example
```

`.env` / `.env.local` はNext.jsが読みます。`.env.local` が優先します。キーはサーバー専用です。

Recallはサーバー側のブラウザでこのページを開くため、`localhost` へはアクセスできません。開発サーバーをHTTPSトンネルで公開するか、アプリをデプロイし、外部からアクセスできるオリジンを `FOCUS_PUBLIC_BASE_URL` に設定してください。公開時は操作用のキーも必要です。

```dotenv
FOCUS_CONTROL_KEY=your-long-random-secret
```

「カメラ出力を開始」で `POST /api/v1/bot/{id}/output_media/` へ次の設定を送ります。

```json
{
  "camera": {
    "kind": "webpage",
    "config": { "url": "https://your-app/focus/camera/session-id#token=read-only-token" }
  }
}
```

レスポンス成功はRecallが要求を受け付けたことを示します。実際の映像は会議で確認してください。今回のローカル環境にはRecallキー・公開URLがなく、実会議でのカメラ切り替えは未検証です。実APIは検証で呼び出していません。

## 共有状態・権限

カメラ用と操作用に別々のランダムトークンを発行します。カメラ用APIは会議名・共有済みメッセージ・終了状態だけを返します。未共有提案、メモ、アジェンダを返しません。カメラリンクを知る人は共有済み内容を閲覧できます。リンクを公開しないでください。

トークンはURLのフラグメントから読み取り、APIにはAuthorizationヘッダーで渡します。カメラ用トークンでは操作できません。期限は作成から12時間。操作用情報はこのタブの `sessionStorage` に一時保存します。多重操作はrevisionで競合を検出します。

開発時は `.focus/sessions/` にセッションを保存します（Git対象外）。この方式は単一サーバー用です。期限後はAPIから読めませんが、ローカルファイルの自動削除は行いません。

Vercel等の公開環境では複数インスタンス間で状態を共有するため、既存のUpstash Redis REST接続情報を設定します。未設定のProductionではセッション作成を503で停止し、不安定なローカルファイル保存へ切り替えません。

```dotenv
UPSTASH_REDIS_REST_URL=https://your-redis-endpoint
UPSTASH_REDIS_REST_TOKEN=your-server-token
```

Redisは12時間のTTLと比較更新で同期します。この実装作業ではサービス作成、契約、公開設定、デプロイを行っていません。

## 既存の映像・チャット部品

`CameraView` は再生可能なURLまたは `MediaStream` を受け取れます。現在の操作パネルでは「会議映像（任意）」に映像URLを指定すると、ボットプレビューと並べて表示します。Recallの `output_media.camera.config.url` は映像受信用URLではなく、ボットが開くWebページです。

旧 `ChatPanel` は互換部品として残していますが、画面には組み込みません。`MeetAgendaPanel` とその表示導線は削除しました。送信・添付はGoogle Meet側で行い、アプリには取得状態だけを表示します。画面はCSSとTailwindの既存構成を利用し、狭い画面では縦並びにします。

表示確認用の `/meeting/demo` では、4人の参加者とFocusのカメラ出力を会議グリッドに並べます。参加者は静止画で、フッターの「デモ表示」から脱線・沈黙・順調の3状態を切り替えられます。この画面はUI確認専用で、実際の会議接続や自動判定は行いません。

## MeetチャットからPDF／Wordを取り込む

Recallのチャットイベントはファイル本体ではなくテキストを返すため、MeetチャットからGoogle DriveのPDF／DOCX共有リンクを送ります。既存のアクセス権を維持し、公開設定への変更は不要です。

1. `.env.local` に `RECALL_API_KEY`、利用リージョンの `RECALL_REGION`、`RECALL_WORKSPACE_VERIFICATION_SECRET`（`whsec_...`）、`FOCUS_PUBLIC_BASE_URL` を設定します。ブラウザでRecallにログインしただけではサーバーへキーは設定されません。キーは画面／Git／チャットへ貼らないでください。
2. `/meeting` の接続設定で「Meetチャット接続情報」を取得し、このセッションのWebhook URLを確認します。
3. 新しいBotを作成する前に、下記CLIへURLを指定します。CLIには同じ環境変数を渡します（既存CLIのenv読み込み方法は `docs/recall-cli.md` 参照）。

   ```bash
   npm run recall -- join --url https://meet.google.com/xxx-yyyy-zzz --chat-webhook https://your-app/api/recall/chat/session-id
   ```

4. 返されたBot IDを「Meetチャット受信Bot ID」に登録します。登録後のメッセージが対象です。既に入室済みのBotにはこの設定を後付けしません。カメラ出力にも同じBot IDを指定します。
5. MeetのチャットへGoogle DriveのPDF／DOCXファイルリンクを投稿すると、操作パネルを開いている間、約2秒周期の同期から自動で読み込みます。アプリ側の選択・保存操作は不要です。新しいアジェンダを受け取ると本文を置き換え、失敗時は前の本文を維持します。通常の会話テキストは無視します。テキストで指定する場合は `#agenda 今日決めること` または `アジェンダ：今日決めること` と送信します。取り込んだ内容が自動でカメラに公開されたりAIへ送信されたりはしません。

自動取り込みは認証済み操作パネルのポーリングから `POST /api/focus/sessions/[id]/agenda/sync` を実行します。操作パネルを閉じている間は履歴のみ保存され、再表示後に最新の対象を取り込みます。受信履歴は直近100件です。同じイベントの成功・失敗結果は再処理せず、失敗時はMeetへリンクを再送してください。処理中の重複実行を避け、中断された処理は60秒後に再試行可能です。旧手動import APIは互換性のため残しますがUIからは使用しません。

`--chat-webhook` または `RECALL_CHAT_WEBHOOK_URL` を指定した場合だけチャット受信を有効化します。公式のチャット専用設定（participant_events、retention:null）を使い、音声／映像の録画項目は追加しません。未指定時は従来の `recording_config:null` のままです。参加者にはチャット受信と保存について事前に説明してください。

Webhookは生本文のHMAC署名、5分以内のタイムスタンプ、登録済みBot IDを検証し、同じイベントIDの重複を除きます。ファイル取得やAI処理はWebhook応答の中では行いません。受信履歴もカメラ用APIには含めません。

非公開Driveファイルは、閲覧権限のあるGoogleユーザーのOAuthアクセストークン `GOOGLE_DRIVE_ACCESS_TOKEN` が別途必要です。これは開発用の短期トークン設定で、Googleログイン画面や自動更新は未実装です。権限は対象ファイルを読める範囲に限定し、有効期限後は更新してください。トークンはGoogle Drive APIにだけ送信します。未設定でも既存の共有権限で取得できるファイルは取り込めます。Google以外のファイルURLは取得しません。

実会議／実キー／Google認証付きファイルでの確認は未実施です。公開環境では上記の操作キー・Redis設定も必要です。

## 検証

```bash
npm test
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

テストは未共有情報の分離、保留／共有／終了、古い提案の拒否、アジェンダ更新、Recallへの送信設定、および既存のJudge・Recall CLI・CI補助処理を検証します。

参照：

- [Recall Output Media](https://docs.recall.ai/docs/stream-media)
- [Recall Receiving Chat Messages](https://docs.recall.ai/docs/receiving-chat-messages)
- [Recall Webhook Authentication](https://docs.recall.ai/docs/authenticating-requests-from-recallai)
- [Upstash REST API](https://upstash.com/docs/redis/features/restapi)
- `docs/product-context.md`（Notion同期済み仕様）
