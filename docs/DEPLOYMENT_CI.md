# GitHub Actions / Vercel 自動デプロイ

機能実装と分離した、チームリポジトリ `jphacks/sd_2603` 用のCI/CDです。

## 動作

| イベント | 処理 |
| --- | --- |
| `feature/**` へのPush | Featureスイッチがtrueなら、チェック後にブランチ別Previewを公開。それ以外はCIのみ |
| `staging` / `main` 宛てPR | Lint → Build（TypeScriptチェック含む）→ Mock APIスモークテスト。デプロイしない |
| `staging` へのPush | Previewスイッチがtrueなら、Lint → Vercel Build → スモークテスト → Preview公開。それ以外はCIのみ |
| `main` へのPush | Productionスイッチがtrueなら、Lint → Vercel Build → スモークテスト → Production公開。それ以外はCIのみ |
| 手動実行 | 選択ブランチのCIのみ。デプロイしない |

実行結果のチェック名は **Lint, build and smoke test** です。Buildは1実行につき1回。デプロイ時は `vercel build` した成果物を `vercel deploy --prebuilt` で公開します。失敗したら公開しません。同じブランチの古いCIはキャンセルしますが、進行中のProductionは中断しません。

PR作成済みのfeatureブランチでは、Push用とPR用のCIがそれぞれ実行されます。公開はPushイベントだけです。フォークからのPRはSecretsなしのCIだけを実行します。

## ブランチごとの固定Preview URL

Featureとstagingには別々の固定URLを割り当てます。同じブランチへの追加Pushでは同じ固定URLが最新の成功したデプロイを指します。他のブランチやProductionのURLは上書きしません。

- URLは `meeting-facilitator-<ブランチ名の一部>-<識別子>.vercel.app` です。
- 識別子はリポジトリ名と元のブランチ名から計算します。`feature/a/b`と`feature/a-b`、大文字・小文字、長い名前の切り詰めによる重複を避けます。
- Vercelの自動生成URLも保持します。どちらもActions実行画面のSummaryに表示します。
- Vercelの認証保護は維持します。ログインやCLIの`vercel curl`でアクセスしてください。
- 独自ドメイン・追加の料金プランは使いません。Pushごとにビルドするため、利用量は増えます。
- ビルドやMock検証が失敗した場合、固定URLは前の成功版のままです。エイリアス更新で失敗した場合はActionsが失敗し、自動生成URLをログで確認できます。
- ブランチ削除時のPreview・URL自動削除は今回の対象外です。


## 初期状態

- 既存のVercelプロジェクト `meeting-facilitator-deploy` を利用し、新規プロジェクト・料金プラン変更は行いません。
- GitHubのスイッチで公開対象を制御します。`ENABLE_FEATURE_PREVIEW_DEPLOYMENT`はfeature、`ENABLE_PREVIEW_DEPLOYMENT`はstaging、`ENABLE_PRODUCTION_DEPLOYMENT`はmainが対象です。未設定またはfalseなら対象ブランチはCIのみです。
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

共有ブランチへのマージは、ユーザーから指示された作業範囲で実施します。現在のチームmainは初期状態のため、CI設定だけをmainへ入れて本番化しないでください。

### 4. Previewを有効にする

1. https://github.com/jphacks/sd_2603/settings/variables/actions を開きます。
2. Repository variable `ENABLE_PREVIEW_DEPLOYMENT` の値を `true` にします。
3. 変数変更だけではデプロイは始まりません。`staging` に次の変更をPush／マージします。
4. すでに実行済みの `staging` のPushイベントのCIがあれば、その実行画面の **Re-run all jobs** でも再実行できます。
5. **Actions → CI and Vercel deployment** の実行結果で、Preview URLが表示されることを確認します。
6. PreviewはVercel認証が必要な場合があります。アクセスできるアカウントで確認します。

### 4-2. FeatureのPreviewを有効にする

1. 上記Variables画面で `ENABLE_FEATURE_PREVIEW_DEPLOYMENT` を `true` にします。
2. Featureブランチにこのワークフローが含まれている必要があります。既存ブランチには、最新stagingを取り込んでからPushします。

```bash
git fetch origin
git switch feature/focus-ui
git merge origin/staging
git push origin feature/focus-ui
```

3. GitHubの **Actions → CI and Vercel deployment** を開きます。
4. 対象ブランチのPush実行を選び、成功後のSummaryの **Branch Preview** のURLを開きます。以後はこのURLをブックマークして利用できます。
5. 追加変更を同じブランチにPushすると、そのブランチのURLだけが更新されます。PRの作成は不要です。

新しいブランチは最新stagingから作ると、この設定を引き継げます。

```bash
git fetch origin
git switch -c feature/your-feature origin/staging
# 編集・コミット後
git push -u origin feature/your-feature
```

手動の **Run workflow** はCIのみです。Run workflowボタンは、このワークフローがデフォルトブランチ（main）へ入った後に利用できます。初回確認にはPushイベントを利用します。

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
- `scripts/ci/report-deployment.mjs`：デプロイ結果のURLをActions Summaryと後続ステップへ渡す。
- `scripts/ci/preview-host.mjs`：ブランチ別Previewの固定ホスト名を計算。公開後にVercel CLIでエイリアスを割り当て。
- `app/api/test-ai/route.ts`：有料AIの実行ガード。UIは変更しません。

GitHub公式ActionsはコミットSHA、Node.jsは24、Vercel CLIはローカルで利用実績がある63.1.2に固定しています。

## トラブル時

- **Secrets missing**：Secretsの名前、登録先（チームリポジトリ）、トークンの有効期限・Scopeを確認します。
- **CI passedだけでURLがない**：ブランチと有効化スイッチを確認します。PR・手動実行は公開しません。featureは対応するスイッチとワークフローの取り込みを確認してください。
- **Git author / Hobby制約**：Vercelの権限・プラン制約を確認してください。CLI化だけで解消するとは保証しません。Author偽装、履歴書き換え、自動課金は行いません。
- **Build失敗**：公開前で停止します。ローカルの `npm run build` とCIログで確認します。アプリのビルドにはGoogle Fontsの取得など外部ネットワークが必要な場合があります。
- **Preview公開後にアプリ操作が失敗**：スモークテストは起動とMock APIの確認です。ブラウザ操作全体のE2Eは今回のCIには含めていません。
- **停止したい**：対象スイッチをfalseにすると、以後のPushはCIのみになります。すでに進行中のデプロイはActions側でキャンセルしてください。公開済みアプリはそのままです。
- **誤ったProductionを公開**：VercelのDeploymentsから以前の正常なProductionへロールバックします。初回構築では、この切り戻し先を残しておきます。

## 参考

- https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
- https://vercel.com/docs/cli/alias
- https://vercel.com/docs/git
- https://docs.github.com/en/actions/reference/security/secure-use
