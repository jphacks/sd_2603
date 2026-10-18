# Jevスコアモニター（Web画面）

会議画面とブラウザを左右に並べ、縦型メーター専用画面を発表用に表示する。Chrome拡張は不要。

## 起動・表示

```bash
nvm use
npm ci
npm run dev
```

`http://localhost:3000/monitor?session=SESSION_ID`を別ウィンドウで開き、Meetと分割表示する。幅360px程度でも3本の縦型メーターを表示できる。

- `/api/judge`の任意の`sessionId`を表示対象とする。省略時は`judge`なので`/monitor?session=judge`を使う。
- `/api/recall/video`は`botId`がセッションID。`/monitor?session=BOT_ID`で表示する。
- 脱線・停滞・寄り道の有用性の実測値を0〜100%で表示。正規化しない。
- 確定判定・理由・実介入後のクールダウン残秒を表示する。
- Mockには実スコアがないため未取得と表示。デモ値への自動切替はしない。
- 実Jevは既存設定の`AI_PROVIDER=jev`、`ALLOW_PAID_AI=true`とGatewayキーが必要。

## 接続と制約

`GET /api/monitor/SESSION_ID`を2秒ごとに読み、Jevの呼び出し頻度は増やさない。非表示タブでは取得・時計更新を控える。会話本文・アジェンダ・キー・音声をモニターAPIへ含めない。

更新停止は3点以上の実測から学習した評価間隔の3倍で判定する。間隔測定前も最終実測からの経過秒を表示。未取得・切断・不正値を0%として扱わない。内部の実測履歴は間隔計算用に直近60秒・最大240件に制限する。

クールダウン→文字起こし不足→既存基本ルールの優先順を維持。60秒ちょうど、文字起こし3件ちょうどで評価可能。INTERVENE表示だけでは実介入を記録せず、Recall映像出力成功時のイベントで記録する。

セッション別ストアは最大32件、10分無更新で破棄。プロセスメモリのため、Vercelの複数インスタンス・再起動をまたぐ配信には共有ストアが必要。現状の連続表示確認は同一ローカルNext.jsプロセスを推奨。読取APIのアクセス制御は既存アプリに従い、会議ごとに推測しにくいセッションIDを使用する。

文字起こしワーカーの評価も`botId`で記録する。脱線の初回推薦をワーカーが保留している間も、画面の`INTERVENE`はモデルの候補判定を示し、実介入やクールダウン開始を意味しない。新Jevの第4問`interveneNow`は判定に使うが、この画面は既存の3本のメーターを表示する。

## 検証

```bash
npm test
npm run lint
AI_PROVIDER=mock ALLOW_PAID_AI=false npm run build
```

UIテストは判定テストから分離した`scripts/check-monitor-ui.mjs`。任意でPlaywrightを別ディレクトリに導入し、Webアプリ起動後に実行する。

```bash
npm install --prefix /tmp/jev-browser-check playwright
/tmp/jev-browser-check/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/jev-browser-check/node_modules/playwright/index.mjs node scripts/check-monitor-ui.mjs
```

ポート変更時は`MONITOR_TEST_URL=http://localhost:PORT`、既存Chrome利用時は`CHROME_EXECUTABLE=/absolute/path/to/chrome`を指定する。テスト内の固定応答で数値・幅360pxの表示・欠損・更新停止・残秒・セッション切替を確認し、有料AIは呼ばない。実Jevと実会議・画面共有での見え方は別途確認する。
