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

## 実行結果からアプリを開く場所

1. GitHubリポジトリの **Actions** タブで **CI and Vercel deployment** を選びます。
2. 対象の実行を開き、左側の **Summary** を選びます（通常は最初から選択されています）。
3. ジョブ一覧より下の実行サマリーまでスクロールします。
4. 本番は **Productionの公開URL → Productionを開く** をクリックします。
5. Previewは **ブランチ別Preview → このブランチの最新版を開く** をクリックします。固定URLなので次のPush後も同じリンクを使えます。
6. その実行の版を開きたい場合は **今回のデプロイ → この実行で公開したアプリを開く** を選びます。

アプリの公開リンクはデプロイしたPush実行に表示します。PR・手動実行などCIのみの実行には公開リンクがありません。表示の改善は新しい実行から適用され、過去の実行サマリーは変わりません。PreviewにVercelのログイン画面が出る場合はアクセス権のあるアカウントでログインしてください。

## ブランチごとの固定Preview URL

Featureとstagingには別々の固定URLを割り当てます。同じブランチへの追加Pushでは同じ固定URLが最新の成功したデプロイを指します。他のブランチやProductionのURLは上書きしません。

- URLは `meeting-facilitator-<ブランチ名の一部>-<識別子>.vercel.app` です。
- 識別子はリポジトリ名と元のブランチ名から計算します。`feature/a/b`と`feature/a-b`、大文字・小文字、長い名前の切り詰めによる重複を避けます。
- Vercelの自動生成URLも保持します。どちらもActions実行画面のSummaryに表示します。
- Vercelの認証保護は維持します。ログインやCLIの`vercel curl`でアクセスしてください。
- 固定URLはVercel公式のAlias APIで割り当てます。既存のチームID・トークンを使い、追加のSecret・Variableは不要です。
- 独自ドメイン・追加の料金プランは使いません。Pushごとにビルドするため、利用量は増えます。
- ビルドやMock検証が失敗した場合、固定URLは前の成功版のままです。エイリアス更新で失敗した場合はActionsが失敗し、自動生成URLをログで確認できます。
- ブランチ削除時のPreview・URL自動削除は今回の対象外です。


## 初期状態

- 既存のVercelプロジェクト `meeting-facilitator-deploy` を利用し、新規プロジェクト・料金プラン変更は行いません。
- GitHubのスイッチで公開対象を制御します。`ENABLE_FEATURE_PREVIEW_DEPLOYMENT`はfeature、`ENABLE_PREVIEW_DEPLOYMENT`はstaging、`ENABLE_PRODUCTION_DEPLOYMENT`はmainが対象です。未設定またはfalseなら対象ブランチはCIのみです。
- CIのビルド・テストは `AI_PROVIDER=mock`、`ALLOW_PAID_AI=false` のまま外部AIを呼びません。stagingの公開環境は `AI_PROVIDER=jev`、`ALLOW_PAID_AI=true`、`JEV_MODEL_ID=typesafe-ai/jev` とし、VercelプロジェクトのPreview環境に登録した `AI_GATEWAY_API_KEY` を実行時に利用します。GitHub SecretsにはJevキーを保存せず、CLI引数にも渡しません。mainとfeatureの公開環境は従来どおりMockです。
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

### 2-2. stagingのJevキーをVercelで設定する

Vercelの `meeting-facilitator-deploy` → **Settings → Environment Variables** で、`AI_GATEWAY_API_KEY` を **Preview** 環境へ登録してください。ブランチで限定する場合は `staging` を指定します。Sensitiveとして登録できます。GitHub ActionsのSecretには登録しません。

キーを登録・変更したらstagingのデプロイを実行してください。環境変数の変更だけでは公開済みデプロイは更新されません。公開後に `/api/judge` のレスポンスに `diagnostic.model` と4つの実スコアが含まれること、`/monitor?session=<sessionId>` に同じスコアが表示されることを確認します。実Jevの呼び出しには利用料金が発生します。

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

1. 上記Variables画面で `ENABLE_FEATURE_PREVIEW_DEPLOYMENT` を `true` にします。Codexで設定できます。
2. Featureブランチにこのワークフローが含まれている必要があります。既存ブランチには、最新stagingを取り込んでからPushします。

```bash
git fetch origin
git switch feature/focus-ui
git merge origin/staging
git push origin feature/focus-ui
```

3. GitHubの **Actions → CI and Vercel deployment** を開きます。
4. 対象ブランチのPush実行を選び、成功後のSummaryの **ブランチ別Preview** のURLを開きます。以後はこのURLをブックマークして利用できます。
5. 追加変更を同じブランチにPushすると、そのブランチのURLだけが更新されます。PRの作成は不要です。

新しいブランチは最新stagingから作ると、この設定を引き継げます。

```bash
git fetch origin
git switch -c feature/your-feature origin/staging
# 編集・コミット後
git push -u origin feature/your-feature
```

手動の **Run workflow** はCIのみです。Run workflowボタンは、このワークフローがデフォルトブランチ（main）へ入った後に利用できます。初回確認にはPushイベントを利用します。

### 4-3. ブラウザとターミナルで確認する

1. GitHubのActions一覧で、対象ブランチのPush実行が緑になったことを確認します。
2. 実行画面のSummaryから **ブランチ別Preview** のURLを開きます。Vercelログインを求められた場合は、アクセス権のあるアカウントでログインしてください。
3. 同じブランチの次のPushでも、この固定URLを開けば最新の成功版を確認できます。キャッシュが疑わしい場合は再読み込みしてください。
4. Vercel CLIを使う場合は、プロジェクトルートで以下を実行します。URLはSummaryの実際の値へ置き換えてください。

```bash
# 未ログインの場合のみ実行
vercel login

PREVIEW_URL="https://Summaryに表示された固定URL"
timeout 30s vercel curl / --deployment "$PREVIEW_URL" -- \
  --show-error --connect-timeout 10 --max-time 15 \
  --output /dev/null --write-out '\nHTTP %{http_code}\n'
```

トップ画面の期待値はHTTP 200です。Focus UIではルートが設定画面へリダイレクトするため、`/setup`を指定して200を確認します。

```bash
timeout 30s vercel curl /api/judge --deployment "$PREVIEW_URL" -- \
  --silent --show-error --connect-timeout 10 --max-time 15 \
  --request POST --header 'Content-Type: application/json' \
  --data '{"agenda":"確認","transcript":["a","b","c"],"secondsSinceLastIntervention":60}' \
  --write-out '\nHTTP %{http_code}\n'
```

期待値は `INTERVENE` とHTTP 200です。Vercel CLIの起動表示だけで止まる場合は認証・通信の待機が考えられます。`timeout 20s vercel whoami`で認証を確認します。外側のタイムアウトの終了コードは124です。

### 4-4. VercelからGoogle Meetへ参加させる

Vercelプロジェクトの **Settings → Environment Variables** で、Preview環境へ次を一度だけ登録してから再デプロイします。値をGitHub、チャット、`NEXT_PUBLIC_` 変数へ置かないでください。

| Name | 内容 |
| --- | --- |
| `RECALL_API_KEY` | Recall.aiの東京リージョンで発行したAPIキー |
| `RECALL_REGION` | `ap-northeast-1` |
| `RECALL_CONTROL_TOKEN` | 32文字以上のランダムな操作トークン |

`VERCEL_TOKEN` はデプロイ用であり、Meet参加フォームの操作トークンには使用しません。環境変数の変更は既存デプロイへ遡って反映されないため、登録後に対象ブランチを再デプロイします。

ブラウザは参加APIから返されたRecallボットIDを保持し、退出APIへ明示的に渡します。Vercelの一時ファイルには依存しません。同じ画面で参加から退出まで操作してください。ページを再読み込みした場合はボットIDが失われるため、Recallダッシュボードから退出させます。本番で複数端末や再読み込み後の管理が必要になったら、ボットIDを共有データベースへ保存します。

参加フォームへ入力できるURLは `https://meet.google.com/abc-defg-hij` 形式の直接リンクだけです。Meet側に参加申請が表示されたら、ホストが **MTG Lab** を許可します。

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
- `scripts/ci/prepare-vercel-env.mjs`：ビルド・ローカル検証用の環境ファイルをMock設定に固定。公開環境のJev設定はworkflowのデプロイ工程で指定。取得した秘密情報はログに出しません。
- `scripts/ci/helpers.test.mjs`：Mock設定の強制、秘密情報の非出力、デプロイ結果のURL検証をテスト。
- `scripts/ci/smoke-test.mjs`：ビルド済みアプリを一時起動し、トップ画面、Judgeの3判定、有料AIテストの403を確認。
- `scripts/ci/report-deployment.mjs`：デプロイ結果のURLをActions Summaryと後続ステップへ渡す。
- `scripts/ci/preview-host.mjs`：ブランチ別Previewの固定ホスト名を計算。固定URLのホスト名を生成。
- `scripts/ci/assign-preview.mjs`：チームIDを指定したVercel公式APIで固定URLを割り当て、成功時だけSummaryへ表示。
- `app/api/test-ai/route.ts`：有料AIの実行ガード。UIは変更しません。

GitHub公式ActionsはコミットSHA、開発・CIのNode.jsは `.nvmrc` の24.22.0（最新LTS確認日：2026-10-16）、Vercel CLIは63.1.2を使用します。ローカルではプロジェクトルートで `nvm install` → `nvm use` を実行してください。

`package.json` の `engines.node` は `24.x` としてVercelのメジャーバージョンを揃えています。Vercel内のマイナー・パッチ版はプラットフォーム側の自動更新です。CIのログにNode.js・npmのバージョンを出力し、Vercel Buildのログでも利用バージョンを確認できます。

`.node-version` も `.nvmrc` と同じ値に揃え、`@types/node` は24系を使います。Windowsのnvm-windowsでは `nvm install 24.22.0` → `nvm use 24.22.0` を実行し、新しいターミナルで `node --version` と `npm run check:runtime` を確認してください。常駐ワーカーも切り替えたNodeで再起動が必要です。npmの開発・ビルド・起動・Lint・テストは24系以外で早期停止します。OS全体のNodeを自動で入れ替える処理はありません。

### Windows local activation

バージョン管理ツールを使わず、OS全体やPowerShellプロファイルを変更したくない場合は、プロジェクト専用のportable Nodeを使えます。この補助スクリプトは自動ダウンロード・インストールをしません。

1. `.nvmrc` の厳密なバージョンを確認し、[Node.js公式リリース一覧](https://nodejs.org/dist/)から対応するWindows x64のZIPと`SHASUMS256.txt`を取得します。現在は`node-v24.22.0-win-x64.zip`です。
2. `Get-FileHash -Algorithm SHA256`の結果を公式のチェックサムと照合してから展開し、`.recall/runtime/node-v24.22.0-win-x64/node.exe`と同じフォルダーの`npm.cmd`が存在する配置にします。`.recall/`はGit対象外です。バイナリやダウンロードした環境ファイルをコミットしないでください。
3. プロジェクトルートのPowerShellで、先頭のドットを含めて実行します。

```powershell
. .\scripts\use-node24.ps1
node --version
npm.cmd --version
npm.cmd run check:runtime
```

実行したターミナルのPATHだけを切り替えます。新しいターミナルでは再実行してください。別のカレントディレクトリから絶対パスでdot-sourceしても、スクリプトの所在からプロジェクトを特定します。繰り返しても同じPATHを重複登録せず、版の違う実体・未配置・`node`の別名による上書きがある場合はエラーになり、システムのNodeへ黙ってフォールバックしません。`-File`による別プロセス実行では現在のターミナルを変更できないため、dot-source以外の呼び出しもエラーにします。

切り替え後の初回やlock更新時は、同じターミナルで`npm.cmd ci`を実行します。npmのPowerShellスクリプト実行ポリシーに依存しないよう、ここでは`npm.cmd`を使います。稼働中のアプリ・ワーカーが同じ`node_modules`を使用している場合は、先にその所有者と停止タイミングを確認し、依存更新を並行実行しないでください。既に整備済みのローカル`.recall/use-node24.ps1`はそのまま利用できますが、共有される手順は上記の`scripts/use-node24.ps1`です。

CIは外部AIを使わない `npm run test:meeting-regression` も実行します。固定した音声・認識結果・判定による配線の回帰テストであり、モデル精度を測るものではありません。


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
- https://vercel.com/docs/rest-api/aliases/assign-an-alias
- https://vercel.com/docs/git
- https://docs.github.com/en/actions/reference/security/secure-use
