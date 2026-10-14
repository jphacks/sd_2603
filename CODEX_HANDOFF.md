# Codex Desktop 引き継ぎ書 — Meeting Facilitator

作成日: 2026-10-14

## 0. Codexへの依頼（最初に読む）

あなたは既存の Next.js プロジェクト `meeting-facilitator` の実装担当です。**まず実際のリポジトリを調査し、この文書の「既知情報」と差異があればコードを正としてください。** 未確認の仕様・ファイル・デバイスAPIを実在するものとして扱わないでください。最初の作業は **Focus UI の3画面を、動作するダミーデータで実装すること**です。M5StickS3・Google Meet・Jevの本番接続は、UI完成後の別フェーズです。

**最重要制約:** ユーザーの明示的な許可なく、有料API呼び出し、課金サービスの有効化、Vercelプラン変更、実デバイスへの未検証の書き込み、Gitの強制Push、チームの`main`へのPushを行わないこと。

## 1. プロジェクトの目的

会議の進行を支援するAIファシリテーター。会議の音声を文字起こしし、判定エンジンが介入要否を `SILENCE` / `WAIT` / `INTERVENE` で返す。介入時は共有ディスプレイにメッセージを大きく表示し、音声でも発言する。UIは会議参加者が操作するチャットではなく、**PCの共有画面に表示する「見るだけ」のFocus型ダッシュボード**。

ユーザー確定要件:
- UI: B案「Focus」。暗色背景、現在の議題・経過/残り時間を大きく、直近発言、AI状態、音声接続状態を表示。
- 操作主体: 共有画面に映すだけ。開始前の設定画面で会議名・アジェンダ・時間を登録。
- 音声入力: ブラウザ経由の自動文字起こしをまず検証。
- 介入: 画面表示 + 音声出力。
- デバイス: **M5StickS3のマイク入力とスピーカー出力の両方**を将来接続。
- 会議ツール: Google Meet。
- 優先画面: PCデスクトップ。
- 会議終了後: 終了画面を表示。TODO抽出は後回し。
- アイコン: Lucide (`lucide-react`, https://lucide.dev/)。

## 2. 開発環境・既知の現状（必ず再確認）

- OS: Windows + WSL2 Ubuntu Bash。**PowerShell前提のコマンドを書かない。**
- 作業ディレクトリ: `/home/fc6.ctrl/products/meeting-facilitator`（`~/products/meeting-facilitator`）。Codex DesktopからWSLの実ディレクトリを開けるか確認する。
- Next.js 16.4.0 / TypeScript / App Router / Tailwind CSS / Turbopack。
- `next.config.ts` は `cacheComponents` が有効だった。Next.js 16では `cacheComponents` と `export const runtime = "nodejs"` 等のRoute Segment Configが衝突する場合がある。**既存設定を確認し、衝突するruntime宣言を追加しない。**
- 既存の `POST /api/judge` はMockで動作確認済みとの過去報告。ただし現状のファイルを確認する。
- `AI_PROVIDER=mock`, `ALLOW_PAID_AI=false` を使用。**APIキーは追加しない。**
- Git remote: `origin` はチームの `jphacks/sd_2603`、`vercel-deploy` は個人の `fu10chi/meeting-facilitator-deploy` の想定。`git remote -v` で確認。
- チーム開発ブランチ: `staging`、機能開発: `feature/*`。チームの`main`は触らない。
- 個人リポジトリの`main`はVercel Productionへデプロイ済み。Preview自動デプロイにはVercel Hobbyのコミット作成者制限が関係する可能性があり、現時点で確実に動くと仮定しない。
- Vercel CLIでの手動Previewデプロイは選択肢だが、**ユーザーの承認なくデプロイしない**。

最初に実行する調査例:

```bash
pwd
git status --short --branch
git remote -v
git branch -a
cat package.json
cat next.config.ts
find app components hooks lib -maxdepth 3 -type f 2>/dev/null | sort
```

存在しないフォルダは作成してよいが、既存の構成に合わせること。作業ツリーに未コミット変更があれば勝手に破棄・上書きしない。

## 3. アーキテクチャ

```text
Google Meet (遠隔参加者) ──[後続フェーズ: タブ音声取得]──┐
                                                        ├─> 文字起こし/発言データ
PCマイク ──[最初の音声MVP: Web Speech API]───────────────┤
M5StickS3マイク ──[後続: Wi-Fi + ローカル音声ブリッジ]────┘
                                                        │
                                                        v
                  Next.js Focus UI + Meeting Session State
                                                        │
                                              POST /api/judge
                                                        │
                                            Mock Judge (現在)
                                            Jev Judge (将来)
                                                        │
                               SILENCE / WAIT / INTERVENE
                                                        │
                              介入オーバーレイ + 音声再生
                                                        │
                PCスピーカー (先行) / M5StickS3 (後続)
```

**重要な境界:**
- Next.js UI、文字起こし、判定、音声出力、M5StickS3ブリッジを疎結合にする。
- ブラウザの `SpeechRecognition` はブラウザ対応・外部サービス利用の可能性があり、任意のPCMバイト列をそのまま渡せるわけではない。M5StickS3のPCM入力をブラウザ認識へつなぐ方式は**要検証**。まずPCマイクで成功させる。
- Google Meetのタブ音声取得にはユーザーの画面共有許可、ブラウザ/OSの対応が必要。自動で取得できると決めつけない。
- M5StickS3はWi-Fi接続しただけではChromeのマイク/スピーカーとして列挙されない。ローカルブリッジ/デバイスファームウェアが必要。
- Vercel Functionsに常時接続の音声中継を依存させない。ブリッジはローカルで検討。
- AIの音声がマイクに再入力されるループを避ける。初期案は再生中に収音/認識を一時停止する半二重方式。
- Google Meet遠隔参加者にAI音声を届けるには、別途Meetへの音声ルーティングが必要。

## 4. 既存Judge APIとの互換性を維持

既知のインターフェース（実コードを確認してから使用）:

```ts
export type JudgeInput = {
  agenda: string;
  transcript: string[];
  secondsSinceLastIntervention: number;
};

export type JudgeResult = {
  action: "SILENCE" | "WAIT" | "INTERVENE";
  reason: string;
  message: string | null;
};
```

想定構成:

```text
app/api/judge/route.ts
lib/judge/types.ts
lib/judge/mock.ts
lib/judge/jev.ts
lib/judge/index.ts
```

- `/api/judge` は `POST`、JSON入力。実際のスキーマ・レスポンスを確認する。
- Mockは一定の発言数や介入間隔による決定的判定で、**脱線を意味理解しているわけではない**。
- `AI_PROVIDER=mock` を既定とし、Jev使用は明示的な許可と `ALLOW_PAID_AI=true` の双方が必要という既存ガードを維持。
- UIから直接AI Gatewayを呼ばない。既存のJudge抽象化を経由する。
- モックでの成功をJev実接続の成功と報告しない。

## 5. UIデザイン指針

- 暗色基調: 深いネイビー背景（例 `#0b1220`）、パネル `#172235`、アクセントはインディゴ/ラベンダー。コントラストと大画面可読性を優先。
- 会議中の最優先情報: **現在の議題 > 経過/残り時間 > AI介入 > 直近発言 > 接続状態**。
- 共有スクリーン向け: 小さいボタン・密なテーブル・長い文字起こし全文を常時表示しない。
- AIが介入すると中央に大きなオーバーレイを表示し、読み上げと同期。待機中は控えめに表示。
- 音声接続は実状態と連動。未接続を「接続済み」と偽装しない。デモデータには「デモ」と表示。
- 日本語UI。Lucideアイコン（`Mic`, `AudioLines`, `Sparkles`, `Timer`, `ListChecks`, `Volume2`, `Wifi`, `Video`, `AlertTriangle`, `Captions` 等）。
- PCデスクトップ優先。ただし狭いウィンドウでも破綻しないようにする。
- アクセシビリティ: キーボード操作、見やすいフォーカス、ARIAライブ領域の過剰読み上げ防止、`prefers-reduced-motion` への配慮。

### 画面1 `/setup`

- 会議タイトル入力。
- アジェンダの追加・削除・並べ替え（最低限、追加・削除で可）。
- 会議時間（分）設定。
- 音声入力選択: PCマイク / M5StickS3（後者は未接続なら未実装/無効を明示）。
- 音声出力選択: PC / M5StickS3（同様）。
- Google Meet音声連携は「後続対応」と明記し、使えない機能を動くように見せない。
- 会議開始ボタン。設定の一時保存は`sessionStorage`などの軽量方式で可。SSR時に`window`へアクセスしない。

### 画面2 `/meeting`

- 全画面表示を想定したFocusレイアウト。
- 会議名・現在議題・アジェンダ進捗・経過時間・残り時間。
- 入力ソースと認識状態（待機、認識中、権限拒否、切断、エラー）。
- 最新の確定発言と暫定発言の区別。
- AI状態（待機、判定中、介入中）。
- `INTERVENE` のオーバーレイ、音声再生の状態。
- 必要最低限の一時停止・終了操作（共有表示中に目立ちすぎない配置）。
- 最初は**ダミー文字起こしと手動介入テスト**で画面動作を実現し、実マイク接続は別フェーズ。

### 画面3 `/summary`

- 会議終了表示、タイトル、経過時間、議題、介入回数。
- TODO自動抽出は**実装しない**。誤ったTODOや確定事項を生成しない。
- 次の会議を始める導線。

## 6. 推奨コンポーネントとデータモデル

既存ファイルがあれば再利用・調整。無理にこの通りのファイル名にする必要はない。

```text
app/setup/page.tsx
app/meeting/page.tsx
app/summary/page.tsx
components/setup/MeetingSetupForm.tsx
components/setup/AudioConnectionTest.tsx
components/meeting/MeetingScreen.tsx
components/meeting/AgendaFocus.tsx
components/meeting/MeetingTimer.tsx
components/meeting/TranscriptPreview.tsx
components/meeting/AudioStatus.tsx
components/meeting/InterventionOverlay.tsx
components/summary/MeetingSummary.tsx
hooks/useMeetingSession.ts
hooks/useSpeechRecognition.ts      # 次フェーズ
hooks/useJudgePolling.ts          # 次フェーズ
hooks/useInterventionAudio.ts     # 次フェーズ
lib/meeting/types.ts
lib/meeting/storage.ts
lib/audio/types.ts                # 次フェーズ
lib/device/protocol.ts            # 次フェーズ
bridge/README.md                  # デバイス仕様が固まった後
```

モデル案:

```ts
export type MeetingPhase = "setup" | "running" | "paused" | "finished";
export type AudioSource = "browser-mic" | "m5sticks3" | "meet-tab";
export type TranscriptEntry = {
  id: string;
  text: string;
  timestamp: number;
  source: AudioSource;
  isFinal: boolean;
};
export type MeetingSession = {
  id: string;
  title: string;
  agenda: string[];
  currentAgendaIndex: number;
  durationSeconds: number;
  startedAt: number | null;
  phase: MeetingPhase;
  transcripts: TranscriptEntry[];
  interventionCount: number;
};
```

**実装注意:** `startedAt` だけでは一時停止を正確に扱えないため、`elapsedBeforePauseSeconds`や`resumedAt`等を追加してもよい。リロード時の状態復元の可否を明記。`sessionStorage`は永続保存ではない。

## 7. 実装順序・PR分割

### Phase 1 — 今すぐ実装（最優先）

1. リポジトリと既存実装を調査し、実際のブランチ・変更状況を報告。
2. `feature/focus-ui` ブランチで作業（存在する場合は再利用・相談）。作業中の変更を破棄しない。
3. `lucide-react` がなければインストール。
4. `/setup`、`/meeting`、`/summary`を作成。
5. デモモードの会議データで画面遷移、タイマー、議題表示、手動介入オーバーレイ、終了画面を動作させる。
6. `npm run lint`（scriptが存在する場合）、`npm run build`、必要に応じて`npm run dev`で検証。
7. 変更ファイル、テスト結果、未実装事項を報告。**コミット・Push・デプロイはユーザーの指示を確認してから**。

Phase 1の完了条件:
- 3画面が実際に遷移できる。
- 会議開始前にアジェンダを設定できる。
- 会議画面で議題・タイマー・状態が見える。
- 手動デモ介入でオーバーレイが出る。
- 終了画面に会議時間・議題・介入回数が表示される。
- ビルドが成功し、既存Judge APIが壊れていない。

### Phase 2 — PC音声MVP

- `SpeechRecognition` をFeature Detection付きでClient Componentから使用。日本語 `ja-JP`、暫定/確定結果の分離、重複防止、停止・エラー処理。
- 新しい確定発言が増えた場合にのみ、約10〜15秒を目安に既存`/api/judge`へPOST。多重リクエスト・連続介入・失敗を抑止。
- Mockの`INTERVENE`でUIオーバーレイとPCの音声出力を同期。ブラウザTTSは対応・日本語音声・ユーザー操作要件を確認。
- AI再生中の再認識ループを防止。

### Phase 3 — M5StickS3

- 実機の正式な型番・マイク/スピーカー仕様・開発環境をユーザーと確認してからファームウェアに着手。
- M5StickS3 ↔ PCのWi-Fi/ローカルブリッジを設計。PCM形式、サンプルレート、フレームサイズ、再接続、レイテンシ、認証を決定。
- デバイスのマイク音声をPCで受信し、音声認識へ渡す実現可能な経路を検証。
- 介入音声は初期段階では定型音声ファイルの再生を推奨。自由文TTSをデバイスへ直送できると仮定しない。
- HTTPSのVercel UIからローカルブリッジに接続する際のMixed Content/Private Network Access/証明書等の制約を検証。

### Phase 4 — Google Meet

- ChromeでのMeetタブ音声キャプチャ（ユーザー許可必須）を検証。
- 対面M5StickS3マイクと遠隔Meet音声の二重認識を避ける。
- 遠隔参加者にもAI介入音声を届けるには仮想音声デバイス等のルーティングを別途検討。

### Phase 5 — Jev接続・TODO（今回の対象外）

- JevのSDK/API仕様とVercel AI Gateway互換性、料金、認証を確認してから実装。
- TODO抽出は後回し。Jevが判定専用でも、別途ルールベースまたは生成モデルを追加すれば実現可能。ただし未検証の抽出結果を確定事項として表示しない。

## 8. Git / Vercel / 費用の安全条件

- `origin/main` を変更しない。`git push --force` を使わない。
- 個人リポジトリへの同期はチームのコード持ち出し許可を前提とする。
- `AI_PROVIDER=mock`, `ALLOW_PAID_AI=false` を維持。
- `AI_GATEWAY_API_KEY` を設定しない。キーをソースに埋め込まない。
- `NEXT_PUBLIC_` 付きの環境変数に秘密情報を入れない。
- `cacheComponents` が有効なら互換性のない`export const runtime`を追加しない。
- Vercel Hobbyでの自動Previewはコミット作成者等の制約に注意。履歴を書き換えて他人のAuthorを自分に偽装しない。
- ユーザーの許可なく有料サービスや外部APIを試さない。

## 9. Codexからの成果報告フォーマット

実装完了時は次を日本語で簡潔に報告:
1. 調査で確認した現状（既知情報との相違点）。
2. 変更したファイルと各画面の機能。
3. 実行したテスト・ビルドの結果（失敗した場合は原因）。
4. 手元での起動方法・操作手順。
5. 未実装・要検証の項目（M5StickS3、Google Meet、Jev等）。
6. 次のPRで着手すべき作業。

## 10. 未確定事項（推測で決めない）

- Google Meetを動かすPCとNext.jsの画面を表示するPCは同一か、別々か。
- M5StickS3の正確な製品仕様、開発環境、ネットワーク接続方法。
- AI介入音声をGoogle Meet遠隔参加者にも聞かせる必要があるか。
- 会議データの保存要件（現時点では一時保存のみ想定）。

**Codexへの最初の実行指示:** リポジトリを調査した後、Phase 1の3画面を実装してください。実機・有料API・デプロイは触らず、動作するFocus UIの完成を最優先にしてください。
