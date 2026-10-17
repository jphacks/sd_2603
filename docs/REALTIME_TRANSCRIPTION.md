# Recall音声 → Gateway文字起こし → Jev判定

`feature/realtime-transcription`の独立Node.jsワーカー。既存のNext.js Judge APIとMockを維持し、会議画面に確定テキストを接続する。

- Recall `audio_mixed_raw.data`（16kHz/mono/PCM16LE）を認証付きWebSocketで受信。
- 約5秒ごとに区切り、24kHzへ変換してAI Gatewayの`openai/gpt-realtime-whisper`へ送る。音声ストリームを閉じて確定を待つ。
- 確定文だけを直近30発言の文脈として既存の`jevJudge`または`mockJudge`へ渡す。介入後60秒の制御も維持。
- 結果を標準出力へJSONで表示。ローカルで音声・文字起こしのファイル保存はしない（Recall側の録音データ保持はRecallの設定に従う）。ログには会話が含まれる。
- 同時接続は1会議、処理待ちは最大3区間。過負荷・上流失敗では処理と再接続受付を停止し（再開はワーカーを再起動）、課金リクエストを自動再試行しない。

## ローカル起動

1. リポジトリルートで`nvm use`、`npm ci`を実行する。
2. `env.download`はそのままルートに置ける。ワーカーだけが`.env.local`→`.env`→`.env.download`→`env.download`の順で読み、先にある値を優先する。シェルとして実行しない。Next.js自体は`env.download`を読まない。
3. `.env.local`を編集し、次を設定する。`env.download`にあるGatewayキーは転記不要。既存`.env.local`の`AI_PROVIDER=mock`と`ALLOW_PAID_AI=false`は優先されるため、実会議テスト時は明示的に変更する。

```dotenv
AI_PROVIDER=jev
ALLOW_PAID_AI=true
ENABLE_REALTIME_TRANSCRIPTION=true
MEETING_AGENDA=今回の会議で決めること
RECALL_API_KEY=Recallのキー
RECALL_REGION=ap-northeast-1
RECALL_AUDIO_TOKEN=十分に長いランダム文字列
RECALL_AUDIO_PUBLIC_URL=wss://公開トンネルのホスト名
RECALL_AUDIO_PORT=8787
```

トークンは`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`で生成し、`.env.local`に保存する。キー・トークンはGitやチャットへ貼らない。

4. 別ターミナルでWebSocket対応トンネルを起動する。ngrokを使う場合は事前にインストール・アカウント認証を済ませ、`ngrok http 8787`を実行する。表示された`https://...`のホストを`wss://...`にして`RECALL_AUDIO_PUBLIC_URL`へ設定する。
5. 自分が入室中の会議URLで、次を実行する。**この操作からRecallと文字起こし・Jevの実API料金が発生し得る。**

```bash
node scripts/recall-transcription.mjs --join 'https://meet.google.com/xxx-xxxx-xxx'
```

6. 会議側で`MTG Lab`を許可する。会話開始から約5秒＋API処理時間で、ターミナルに`{"transcript":"...","judge":{"action":"..."}}`が表示される。
7. 終了はCtrl+C。このワーカーで作成したBotへ退出を要求する。Bot IDは`.recall/transcription.json`に保存し、退出成功時に削除する。途中終了・ネットワーク失敗時はRecallダッシュボードで保存済みIDのBotを退出させ、退出確認後に状態ファイルを削除する。

ヘルスチェックは`curl http://127.0.0.1:8787/health`。受信URLや認証トークンはヘルス応答・起動ログに出さない。

## 既存会議画面との接続（推奨）

作業中に`staging`へRecall実装が追加されたため、`08cb672`まで取り込んで接続済み。

上記の環境変数に加え、`.env.local`に次を設定する。

```dotenv
TRANSCRIPTION_INGEST_URL=http://localhost:3000/api/transcription/utterances
```

1. `env.download`の`AI_GATEWAY_API_KEY`と`JEV_MODEL_ID`も`.env.local`へコピーする。Next.js側では`env.download`を読まないため必要。
2. `npm run dev`でWebアプリを起動する。
3. トンネルを起動し、別ターミナルで`node scripts/recall-transcription.mjs`を起動する。会議画面から入室させるため、`--join`と`RECALL_BOT_ID`は不要。議題は画面入力が使われる（ワーカーの`MEETING_AGENDA`は単独CLI用）。
4. `http://localhost:3000`で議題と会議URLを入力してBotを入室させる。`ENABLE_REALTIME_TRANSCRIPTION=true`なら、従来のRecall内蔵文字起こしに代わり音声WebSocket配信を選択する。`RECALL_WEBHOOK_URL`はこのモードでは不要。
5. ワーカーの確定文は認証付き`/api/transcription/utterances`へ送られ、既存ストア・Jev判定・会議画面のポーリング表示につながる。画面から退出させ、ワーカーをCtrl+Cで止める。

`ENABLE_REALTIME_TRANSCRIPTION=false`なら、既存のRecall署名付き日本語文字起こしWebhookの動作を維持する。既存の入退室CLIも変更していない。同じ会議へ画面とCLIから重複入室させない。

ストアは既存実装のプロセスメモリ。ローカルでは同じNext.jsプロセスで受信・画面取得できるが、サーバーレスの複数インスタンスや再起動をまたぐ共有には永続ストアが必要。現状の実会議確認はローカル構成を推奨する。

## 検証・制約

```bash
node --test scripts/transcription/*.test.mjs lib/judge/jev.test.mjs scripts/ci/helpers.test.mjs
npm run lint
npm run build
```

テストはAPIをモックし、有料通信をしない。実Recall音声の認識品質・Gatewayアカウントのモデル利用可否は実会議で別途確認する。Gateway音声機能はベータで、チームによって利用可否が異なる。

このワーカーは公開WebSocketを受ける常駐プロセス。VercelのNext.js Functionsへの自動デプロイには含めない。継続運用時はWebSocket対応の常駐ホストとTLS、監視を用意する。現状は約5秒単位の確定で、話者分離、音声での介入、複数会議、切断時の音声再送は未実装。

仕様根拠: [Recall mixed audio](https://docs.recall.ai/docs/how-to-get-mixed-audio-real-time)、[Recall WebSocket認証](https://docs.recall.ai/docs/real-time-websocket-endpoints)、[Gateway streaming transcription](https://vercel.com/docs/ai-gateway/modalities/speech-to-text)。
