# Phase 1 / Focus UI

## 起動

```bash
npm install
AI_PROVIDER=mock ALLOW_PAID_AI=false npm run dev
```

http://localhost:3000/setup を開きます。ルート `/` からも設定へ移動します。

## 確認手順

1. 会議名・議題・時間（1〜240分）を入力。議題を追加・削除します。
2. 「デモ会議を始める」で `/meeting` へ移動します。
3. 議題を切り替え、残り時間と経過時間、デモ発言を確認します。
4. 一時停止／再開を試します。停止中は時間とデモ発言の進行を止めます。
5. 「デモ介入を試す」で判定中→中央オーバーレイ→待機を確認します。6秒で閉じ、Escや閉じるボタンでも閉じられます。
6. 「終了」で `/summary` へ移動し、経過時間・登録議題・デモ介入回数を確認します。
7. 「次の会議を準備する」で設定に戻ります。

## 保存とデモの境界

設定と会議状態は sessionStorage に一時保存します。同じタブの再読み込みでは議題・タイマー・一時停止・終了結果が復元されます。進行中のリロードでは閉じていた間の時間も経過時間に含まれます。タブを閉じると記録は失われます。保存が利用できない場合はメモリで動作し、再読み込みでは復元されません。

設定の自動保存は入力が妥当なときに行います。未入力の議題を含む編集中の内容は再読み込みで最後の妥当な設定へ戻ります。

デモ発言は経過時間に応じたサンプルです。AI介入は手動演出で、意味理解や外部判定を行いません。介入回数は手動デモの起動回数です。音声入力・音声再生は未実装で、デモ表示のみです。予定時間終了後は超過表示し、終了操作まで計測を続けます。

Judge APIとMock判定は変更していません。既存 `/api/test-ai` には `AI_PROVIDER=jev` と `ALLOW_PAID_AI=true` の両方が必要なガードを追加しました。Phase 1のUIからいずれのAI APIも呼びません。

## 後続作業

Phase 2でPC音声認識の対応確認、暫定／確定発言管理、Judge連携、音声出力と再入力防止を検証します。M5StickS3・Google Meet・Jev実接続・TODO抽出は今回の対象外です。

## 変更ファイル

- `app/setup/page.tsx`、`app/meeting/page.tsx`、`app/summary/page.tsx`：3画面のルート。
- `components/focus/Setup.tsx`、`Meeting.tsx`、`Summary.tsx`：設定、Focus表示、終了結果。
- `components/focus/Shell.tsx`、`SessionProvider.tsx`：共通表示と一時保存の状態管理。
- `lib/meeting/session.ts`：入力・保存データの検証、会議モデル、タイマー計算。
- `app/page.tsx`：設定画面へ移動。
- `app/layout.tsx`、`app/globals.css`：日本語メタデータ、暗色テーマ、Tailwind、キーボードフォーカスと動きを減らす設定。
- `package.json`、`package-lock.json`：lucide-react追加。
- `app/api/test-ai/route.ts`：既存テストAPIへの有料AIガード追加。
- `AGENTS.md`：next devが生成したフィードバック指示。既存ブロックを保持。
- `FOCUS_UI.md`：操作・保存・検証の説明。

`CODEX_HANDOFF.md` は要件・フェーズ・制約をまとめた引き継ぎ書です。Judge関連ファイルと `app/api/judge/route.ts` は変更していません。

## 検証結果（2026-10-14）

- Lint：エラー0、既存 `lib/judge/jev.ts` の未使用引数警告1件。
- TypeScript：`npx tsc --noEmit` 成功。
- Build：最初のローカルBuild成功。後続のローカルBuildはCSS処理のポート作成が環境で拒否されTurbopackが失敗。最終版はVercelのPreview・Productionで `npm run build` 成功。
- ローカルとProductionのブラウザ検証：設定、議題追加・削除、開始、議題切替、一時停止・再開、リロード復元、手動介入、Escで閉じる、終了結果が成功。
- 375・768・1440pxで横方向のはみ出しなし。ブラウザ実行エラーなし。
- Mock Judge：SILENCE / WAIT / INTERVENEの各応答を確認。
- Preview：認証付きで3画面HTTP 200、Mock INTERVENE正常、有料AIテスト403。
- Production：公開設定URLがHTTP 200、3画面ブラウザ動作とMockの3判定を確認、有料AIテスト403。

## デプロイ

- Production：https://meeting-facilitator-deploy.vercel.app/setup
- Preview：https://meeting-facilitator-deploy-3clzldn50-fu-10.vercel.app/setup

ユーザーの明示的なデプロイ指示により、既存VercelプロジェクトへCLIでデプロイしました。PreviewはVercel認証が必要です。両環境のビルド時・実行時の設定は `AI_PROVIDER=mock`、`ALLOW_PAID_AI=false`。料金プラン・チームmain・Git履歴は変更していません。
