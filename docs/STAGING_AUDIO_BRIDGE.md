# Staging Meet音声 → AI Gateway文字起こし → Jev

この構成は常時起動の音声worker＋同一ホストのNextアプリを判定の所有者にする。
Vercel Functionsのローカルファイルやメモリを別インスタンスと共有しない。
ステージング検証では承認済みの一時トンネルをworkerポートだけに向ける。
PC停止・トンネル終了時は動かない。恒久運用には常時稼働ホストが必要。

## 処理経路

1. Vercelの参加操作が認証付き `/ready` でworkerと判定アプリの準備を確認。
2. Recall Botの作成後、`/sessions` へBot ID・初期アジェンダを登録。
   登録に失敗すると、作成したBotだけに退出を要求する。
3. Recallの `audio_mixed_raw.data` をworkerのWSSに受信。
4. workerからAI Gatewayの既存 `openai/gpt-realtime-whisper` へ送信。
5. 確定文字起こしを同じホストのNextアプリへ渡し、JevをAI Gateway経由で実行。
6. グラフ・資料アップロード・Meetチャットは認証付きbridgeで同じ判定アプリへ中継。
   推奨の保持・アジェンダ世代・クールダウンも単一Nextプロセスで管理する。
7. 通常の退出完了後にworkerの該当セッションを停止。

Jevの判定条件や介入の安全条件は変更しない。短い発話だけでは判定・表示に至らない場合がある。
参加画面の音声ステータスで音声接続、受信、文字起こし件数、実Jev判定件数を区別する。
カウンターは診断用であり認識の正確さを保証しない。

## Vercel（サーバー専用、NEXT_PUBLICを付けない）

```dotenv
ENABLE_REALTIME_TRANSCRIPTION=true
AI_PROVIDER=jev
ALLOW_PAID_AI=true
AI_GATEWAY_API_KEY=<既存のキー>
RECALL_AUDIO_WORKER_URL=https://<workerの公開ホスト>
RECALL_AUDIO_PUBLIC_URL=wss://<同じworkerの公開ホスト>
RECALL_AUDIO_TOKEN=<32文字以上の専用秘密値>
RECALL_CONTROL_TOKEN=<判定アプリと共通の既存秘密値>
```

## 常時起動ホスト（ローカル検証も同じ）

既存APIキーをgit管理外の環境設定に入れる。

```dotenv
ENABLE_REALTIME_TRANSCRIPTION=true
AI_PROVIDER=jev
ALLOW_PAID_AI=true
AI_GATEWAY_API_KEY=<既存のキー>
RECALL_API_KEY=<VercelでBotを作成するRecallプロジェクトと同じキー>
RECALL_REGION=ap-northeast-1
RECALL_CONTROL_TOKEN=<Vercelと共通>
RECALL_AUDIO_TOKEN=<Vercelと共通>
RECALL_AUDIO_BRIDGE_MODE=true
RECALL_AUDIO_PORT=8787
VIDEO_CONTROL_URL=http://127.0.0.1:3000/api/recall/video
BROWSER_CONTROL_ENABLED=false
```

このホストでは `RECALL_AUDIO_WORKER_URL` を未設定にする（中継ループ防止）。
Nextは `127.0.0.1:3000` のみにバインドし、workerを別プロセスで起動する。
同一ホストのNextは1プロセスに限定する。Next側の状態は再起動で消える。
workerのプロセスが再起動した場合は参加画面から退出・再参加する。
資料やMeetチャットの署名検証用 `RECALL_WEBHOOK_SECRET` も両者で一致させる。

トンネルの接続先は `http://127.0.0.1:8787` のみ。
Next全体を公開しない。bridgeは専用トークンを要求し、登録Botと固定のAPIパス以外は拒否。
認証情報はリダイレクト先へ送らず、音声・全文文字起こしは診断用に保存しない。
`RECALL_AUDIO_DIAGNOSTIC_CAPTURE` は無効のままにする。
VercelのDeployment Protectionは解除しない。

## 検証の区別

- 自動テスト：偽のRecallイベントと偽の文字起こしで、登録・認証・ルーティング・キャンセルを確認。
- 実APIテスト：合成音声をGatewayへ送り、文字起こしとJev diagnosticを確認（有料）。
- Meet実機：再参加したBotからrawFrames → sttFinal → jevDecisionsが増えることを確認。
  実機が未確認の段階で完了とは扱わない。

現状、デバイス操作APIはbridge対象外。遠隔デバイス制御を同時運用する場合は別途統合が必要。

### 今回の確認結果

2026-10-18: 合成日本語音声3発話をRecall形式のPCMイベントとして実workerへ送信。
実AI Gatewayで確定文字起こし3件を取得し、実Jev判定1件（STALLED、stalled=0.90）を確認。
同じ結果をbridge経由のmonitor APIから取得できた。
架空のBot IDで安全に検証したため、Recall映像出力は対象外。Meetの生音声を使用した試験ではない。
