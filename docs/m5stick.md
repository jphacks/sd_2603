# M5StickS3 デバイス連携

対面の参加者向けに、会議の状態を M5StickS3 の画面とスピーカーで伝える。状態の判定と Meet の画面切り替えは今のサーバー側のまま変えず、M5 は表示・再生とボタン入力だけを担当する。サーバー側（API とボタン状態の反映）は実装済み。ファームウェアは未実装。

## 前提にしている既存実装

| 実装 | 場所 | M5 での使い方 |
| --- | --- | --- |
| 画面の種類 `idle` / `off_agenda` / `stalled` | `lib/recall/video.ts` の `VideoView`、`videoCopy()` | Meet のカメラカードと同じ 3 種類を M5 でも使い、文言も共有する |
| 介入の実行と記録 | `lib/recall/controller.ts` の `applyVideoDecision`、`onIntervened` | 介入が成功した時点で M5 の音を鳴らす合図にする |
| スコアと判定の保持 | `lib/monitor/store.ts`（`feature/jev-score-monitor`） | M5 用 API はこのストアを読むだけにして、Jev の呼び出しを増やさない |
| セッション ID | `/api/recall/video` の `botId` が `/api/monitor/SESSION_ID` と同じ | M5 も同じ ID を使う |
| 判定 | `SILENCE` / `WAIT` / `INTERVENE`、60 秒のクールダウン | M5 のボタン操作もこの仕組みの中で扱う |

## 方針

- M5 は音声を録音しない。自分のスピーカー音を拾う問題を避け、文字起こしは Recall.ai に任せる。
- M5 は読み取り専用のポーリング（2 秒間隔）にする。モニター画面と同じ間隔。
- 音声は端末のフラッシュに入れた短い定型クリップを `cue` で選んで鳴らす。サーバーで TTS を作って転送しない。
- 会話本文とアジェンダの全文は M5 に送らない（モニターの方針と同じ）。画面に出すのは短い定型文だけ。

## API

### `GET /api/device/{sessionId}`

M5 が 2 秒ごとに読む。`Authorization: Bearer <DEVICE_TOKEN>` を付ける。`Cache-Control: no-store`。

```json
{
  "v": 1,
  "seq": 42,
  "state": "intervene",
  "view": "off_agenda",
  "face": "redirect",
  "title": "議題に戻りませんか？",
  "agendaShort": "次のリリース方針を決める",
  "scores": { "drift": 82, "stall": 15, "tangent": 20 },
  "cooldownSec": 47,
  "muted": false,
  "cue": { "id": "back_to_agenda", "seq": 3 }
}
```

| フィールド | 意味 |
| --- | --- |
| `seq` | スナップショットの連番。古い応答を捨てる。ストアの `sequence` を使う |
| `state` | `silence` / `wait` / `intervene`。まだ判定が1回もないときは `unknown`。画面は状態の色ではなく `face` の表情で表す |
| `view` | `idle` / `off_agenda` / `stalled`。`videoCopy()` と同じ区分。最後の実介入から一定時間だけ非 `idle`、以降は `idle` に戻す |
| `face` | `watching` / `nudge` / `redirect`。画面に描く AIDA の表情。`view` が `idle` なら `watching`、`stalled` なら `nudge`、`off_agenda` なら `redirect`。Meet のカメラカードと同じ対応（`DESIGN.md`） |
| `title` / `agendaShort` | 画面用の短い文言。アジェンダは 12 文字程度に切る。M5 の画面は小さいので 2 行まで |
| `scores` | 0〜100 の整数。ストアの 0〜1 の実測値を変換。未取得は `null`（0 として扱わない） |
| `cooldownSec` | 次に介入できるまでの残り秒数（`remainingCooldown`） |
| `muted` | 「有益な寄り道」ボタンで黙らせている間は `true` |
| `cue` | 鳴らす音。`seq` が前回より増えたときだけ一度鳴らす。ポーリングで同じ音を繰り返さない |

`cue.id` の候補は `back_to_agenda`（脱線）、`summarize`（停滞）、`decide`（担当決めを促す）の 3 つ。

### `POST /api/device/{sessionId}/event`

ボタン入力。`Authorization: Bearer <DEVICE_TOKEN>`。リクエストは 1 KB まで。

```json
{ "type": "back", "deviceId": "m5-01" }
```

| `type` | 動き |
| --- | --- |
| `back` | 「戻して」。人が気づいたときの介入。サーバーが、そのセッションの次の判定呼び出しで `INTERVENE` を強制し（クールダウン中も受け付け、理由は `Manual request`）、Meet 側のカードと M5 の音を同時に出す。クールダウン中は無視して `cooldownSec` を返す |
| `tangent_ok` | 「この寄り道は有益」。一定時間（案: 120 秒）だけ介入を止める。`muted: true` になる |
| `unmute` | `tangent_ok` を取り消す |

どのイベントも `{ "accepted": true, "seq": n }` か `{ "accepted": false, "reason": "COOLDOWN" }` を返す。

## ボタンと画面の割り当て

| 操作 | 動き |
| --- | --- |
| ボタン A 短押し | `back`（戻して） |
| ボタン A 長押し | `unmute` |
| ボタン B 短押し | `tangent_ok`（有益な寄り道） |
| ボタン B 長押し | 画面表示の切り替え（状態表示 ⇄ スコアのゲージ） |
| 画面（通常） | 白地の中央に `face` の表情を黒で描き、下に `title` を出す。左上に次の介入までの残り秒数。寄り道OK の間は「寄り道OK・介入停止中」 |
| 画面（スコア） | 脱線・停滞・寄り道の有用性を縦のゲージで表示（モニター画面と同じ 3 本、同じ色） |
| 切断時 | 灰色の「見守る」の表情と「接続待ち」を出す。最後の値を現在値として出さない |

## 必要な変更

1. `lib/monitor/store.ts`: 最後の実介入の種類（`off_agenda` / `stalled`）と、`back` / `tangent_ok` の状態（`forceNext`、`mutedUntil`）を保存する。`intervened()` に種類を渡す。
2. `lib/judge`: `mutedUntil` の間は `INTERVENE` を `WAIT` にする。`forceNext` のときは判定を飛ばして介入扱いにする。判定ロジックそのものは変えず、ストアを見る薄いラッパーにする。
3. `app/api/device/[sessionId]/route.ts` と `.../event/route.ts` を追加する。トークン確認は `authorizedControl` を流用し、環境変数 `DEVICE_TOKEN`（32 文字以上）を追加する。
4. ファームウェア（別リポジトリか `firmware/`）: Wi-Fi 接続、2 秒ポーリング、描画、ボタン、クリップ再生。`cue.seq` の変化で一度だけ鳴らす。

## 制約と未確認

- **ストアはプロセスメモリ**: Vercel の複数インスタンスでは M5 が違うインスタンスを読むと状態が飛ぶ。デモはローカルの Next.js 1 プロセスで行い、デプロイ版でやる場合は共有ストア（Redis など）が必要。
- **Meet 側との同時性**: Recall の映像出力の成功後に `onIntervened` が呼ばれるので、M5 の音は Meet のカードの出た後になる。数秒のずれは許容する。
- **`back` の強制介入**: 人が押したのに AI が黙るのは信頼を落とすので、クールダウン中でも受け付けるかをデモ前に決める（案: 受け付けて `reason: "MANUAL"` として記録）。
- **スピーカーの音量と音質**: 会議室の広さで聞こえるかは実機で確認する。聞こえない場合は画面の点滅だけにする。
- **配線の経路**: 会社や会場の Wi-Fi が端末の接続を許すか未確認。許さない場合はスマホのテザリングを使う。

## 実装済みの範囲

- `lib/device/`: ボタン状態（`state.ts`）、応答の組み立て（`payload.ts`）、判定への反映（`judge.ts`）とテスト。
- `app/api/device/[sessionId]` と `.../event`。`DEVICE_TOKEN`（32 文字以上）が必要。
- `/api/recall/video` の判定にボタン状態を反映し、介入成功時に M5 の音の合図を更新する。
- `back` は次の判定呼び出しで効く。判定の呼び出し元（文字起こしワーカー）の間隔だけ遅れる。
- 自動文字起こし経路でもボタン状態を反映する。`back` による明示操作だけは AI の脱線判定の二回確認を待たないが、発言再開・議題変更・停止時の取消は維持する。表示成功時だけ合図を更新し、Meet のカードはワーカーが 8 秒後に待機表示へ戻す。
- `POST /api/device/{sessionId}/debug`: 開発用。`NODE_ENV=development` のときだけ動き、疑似の判定結果と介入の合図を入れて、画面・ゲージ・音を確認できる。本番では 404。
- `firmware/` の `SESSION_ID` を `"auto"` にすると、`GET /api/monitor` が返す今の会議（アプリから最後に参加させた Bot）に 10 秒ごとに追従する。会議ごとに書き込み直さなくてよい。
- `firmware/`: PlatformIO の雛形。実機（M5StickS3、2.4GHz Wi-Fi）で、取得・色・ボタン送信・ゲージ・介入の音を確認済み。Recall の実会議を通した確認は未実施。
