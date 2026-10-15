# GitHub Actions / Vercel 自動デプロイ

機能実装と分離した、チームリポジトリ `jphacks/sd_2603` 用のCI/CDです。

## 動作

| イベント | 処理 |
| --- | --- |
| `feature/**` へのPush | Lint → Build（TypeScriptチェック含む）→ Mock APIスモークテスト |
| `staging` / `main` 宛てPR | 同上。フォークPRにもデプロイ用Secretsを渡さない |
| `staging` へのPush | Previewスイッチがtrueなら、Lint → Vercel Build → スモークテスト → Preview公開。それ以外はCIのみ |
| `main` へのPush | Productionスイッチがtrueなら、Lint → Vercel Build → スモークテスト → Production公開。それ以外はCIのみ |
| 手動実行 | 選択ブランチのCIのみ。デプロイしない |

実行結果のチェック名は **Lint, build and smoke test** です。Buildは1実行につき1回。デプロイ時は `vercel build` した成果物を `vercel deploy --prebuilt` で公開します。失敗したら公開しません。同じブランチの古いCIはキャンセルしますが、進行中のProductionは中断しません。

PR作成済みのfeatureブランチでは、Push用とPR用のCIがそれぞれ実行されます。VercelデプロイはPRイベントでは実行しません。

## 初期状態

- 既存のVercelプロジェクト `meeting-facilitator-deploy` を利用し、新規プロジェクト・料金プラン変更は行いません。
- GitHubの `ENABLE_PREVIEW_DEPLOYMENT` / `ENABLE_PRODUCTION_DEPLOYMENT` が未設定またはfalseなら、CIのみ実行します。
- 両環境ともビルド時・実行時は `AI_PROVIDER=mock`、`ALLOW_PAID_AI=false` です。キーは追加しません。
- `/api/test-ai` にはFocus UI側で検証済みのガードを取り込み、CIで外部AI処理が走るのを防ぎます。
- GitHub Secretsへ渡すVercelトークンは利用者本人が発行・登録します。ローカルCLIのログイントークンは流用しません。

## 最初に利用者が行う設定

### 1. Vercelトークンを発行する

1. ブラウザで https://vercel.com/account/settings/tokens を開きます。
2. このアプリのVercelプロジェクトにアクセスできるアカウントでログインします。
3. **Create Token** を選び、名前を `meeting-facilitator-github-actions` にします。
4. Scopeはプロジェクトを所有する **FU10 / fu-10** を選びます。選択UIが異なる場合は、このプロジェクトにアクセスできる最小のスコープを選択してください。
5. 有効期限を設定します（例：30日）。期限切れ後はGitHub Secretの更新が必要です。
6. 作成したトークンをコピーします。チャット・Slack・ソースコードには貼らないでください。

### 2. GitHub Secretsを設定する

1. https://github.com/jphacks/sd_2603/settings/secrets/actions を開きます。
2. **New repository secret** をクリックします。
3. Nameを `VERCEL_TOKEN`、Secretを先ほどのトークンにして保存します。
4. 次の2件も存在するか確認します。これらのIDはCodexで設定可能です。

| Name | 値 |
| --- | --- |
| `VERCEL_ORG_ID` | `team_D2li5kAfLxewRlgElQGEDYhB` |
| `VERCEL_PROJECT_ID` | `prj_rdyWfklQEPHdNzze4jYYoc14N5x7` |

このワークフローはRepository Secretsを利用します。Environment Secretsだけに登録しても読み取れません。トークンはログに出力しません。

### 3. PRをレビューしてstagingへマージする

1. `feature/deploy-ci` → `staging` のPRでCI成功を確認します。
2. 差分をレビューし、GitHub上でPRをマージします。
3. Focus UIもPreviewで確認したい場合は、`feature/focus-ui` → `staging` も先にマージしてください。
4. `staging` の最新コミットに、公開したい内容が含まれていることを確認します。

Codexは `main` / `staging` へのマージを自動では行いません。現在のチームmainは初期状態のため、CI設定だけをmainへ入れて本番化しないでください。

### 4. Previewを有効にする

1. https://github.com/jphacks/sd_2603/settings/variables/actions を開きます。
2. Repository variable `ENABLE_PREVIEW_DEPLOYMENT` の値を `true` にします。
3. 変数変更だけではデプロイは始まりません。`staging` に次の変更をPush／マージします。
4. すでに実行済みの `staging` のPushイベントのCIがあれば、その実行画面の **Re-run all jobs** でも再実行できます。
5. **Actions → CI and Vercel deployment** の実行結果で、Preview URLが表示されることを確認します。
6. PreviewはVercel認証が必要な場合があります。アクセスできるアカウントで確認します。

featureブランチのCIを再実行しても、Previewは作成されません。手動の **Run workflow** もCIのみです。Run workflowボタンは、このワークフローがデフォルトブランチ（main）へ入った後に利用できます。初回PreviewにはstagingのPushイベントを利用します。

### 5. Productionを有効にする

1. Previewで期待するアプリが動いていることを確認します。
2. Vercelプロジェクトの **Settings → Git** を開きます。
3. 現在接続されている個人リポジトリ `fu10chi/meeting-facilitator-deploy` のGit連携を **Disconnect** します。GitHub ActionsのCLIデプロイはこの連携を使用しません。
4. これにより、個人リポジトリmainのPushによる二重のProduction更新を防ぎます。既存デプロイを削除する操作ではありません。
5. GitHub Variablesの `ENABLE_PRODUCTION_DEPLOYMENT` を `true` にします。
6. 検証済み `staging` → `main` のPRを作り、CI成功を確認してマージします。
7. mainのPushイベントでProductionが更新されます。ActionsのSummaryと https://meeting-facilitator-deploy.vercel.app/ を確認します。

トークンを登録してもスイッチがfalseなら公開しません。スイッチをtrueにしても過去のPushが自動で処理されることはありません。

## ファイル構成

- `.github/workflows/ci-deploy.yml`：チェックとブランチ別デプロイ。
- `scripts/ci/prepare-vercel-env.mjs`：Vercelから取得した環境ファイルをMock設定に固定。取得した秘密情報はログに出しません。
- `scripts/ci/helpers.test.mjs`：Mock設定の強制、秘密情報の非出力、デプロイ結果のURL検証をテスト。
- `scripts/ci/smoke-test.mjs`：ビルド済みアプリを一時起動し、トップ画面、Judgeの3判定、有料AIテストの403を確認。
- `scripts/ci/report-deployment.mjs`：デプロイ結果のURLをActions Summaryへ表示。
- `app/api/test-ai/route.ts`：有料AIの実行ガード。UIは変更しません。

GitHub公式ActionsはコミットSHA、Node.jsは24、Vercel CLIはローカルで利用実績がある63.1.2に固定しています。

## トラブル時

- **Secrets missing**：Secretsの名前、登録先（チームリポジトリ）、トークンの有効期限・Scopeを確認します。
- **CI passedだけでURLがない**：ブランチと有効化スイッチを確認します。PR・feature・手動実行は公開しません。
- **Git author / Hobby制約**：Vercelの権限・プラン制約を確認してください。CLI化だけで解消するとは保証しません。Author偽装、履歴書き換え、自動課金は行いません。
- **Build失敗**：公開前で停止します。ローカルの `npm run build` とCIログで確認します。アプリのビルドにはGoogle Fontsの取得など外部ネットワークが必要な場合があります。
- **Preview公開後にアプリ操作が失敗**：スモークテストは起動とMock APIの確認です。ブラウザ操作全体のE2Eは今回のCIには含めていません。
- **停止したい**：対象スイッチをfalseにすると、以後のPushはCIのみになります。すでに進行中のデプロイはActions側でキャンセルしてください。公開済みアプリはそのままです。
- **誤ったProductionを公開**：VercelのDeploymentsから以前の正常なProductionへロールバックします。初回構築では、この切り戻し先を残しておきます。

## 参考

- https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
- https://vercel.com/docs/git
- https://docs.github.com/en/actions/reference/security/secure-use
