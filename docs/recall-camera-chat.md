# Focus 操作パネルとボットのカメラ出力

`feature/recall-camera-chat` で実装。`staging` の `ffc09b4`（Recall入退室CLIを含む）をpullした状態が起点です。

## 画面と動作

- `/meeting`：会議を準備し、右側のFocusパネルで提案を確認。中央はボットカメラのプレビューです。
- `/focus/camera/[id]#token=...`：Recallが描画する専用ページ。共有した提案だけを表示します。
- 「提案を入力する」または接続設定の「提案の表示を試す」で提案を作成。準備した提案は操作パネルだけに表示されます。
- 「あとで」で保留。メモ欄から再提案できます。「会議に共有」でカメラ表示を更新します。
- 「カメラの提案を閉じる」で待機表示へ戻ります。「サポート終了」で共有を消し、カメラ側も終了表示になります。Recallボットの退出は既存CLIで別途行います。
- チャットはプライベートなメモとしてサーバーに保存。UTF-8のTXT/MD/CSV添付はアジェンダへ取り込みます。各ファイル1MB・3件まで、アジェンダ全体20000文字以内、メモ4000文字・50件までです。
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

`ChatPanel` は履歴・Enter送信・Shift+Enter改行・IME送信抑止・添付検証を提供します。チャット内容はプライベートメモになり、Meetの会議チャットへ自動送信しません。画面はCSSとTailwindの既存構成を利用し、狭い画面では縦並びにします。

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
- [Upstash REST API](https://upstash.com/docs/redis/features/restapi)
- `docs/product-context.md`（Notion同期済み仕様）
