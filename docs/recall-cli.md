# Recall.ai CLI — セットアップと操作

`sd_2603` から Google Meet へボットを入れ、状態を見て、退出させる。録画と文字起こしはしない。実装方針はワークスペースの `docs/recall-cli-join-leave.md`。

作業ブランチは `feature/recall-join-leave`。

```powershell
npm run recall -- join --url https://meet.google.com/abc-defg-hij
npm run recall -- status
npm run recall -- leave
```

## 1. 用意するもの

- Node.js **24.22.0**（`.nvmrc`）
- Recall.ai の **東京（`ap-northeast-1`）** ワークスペースで発行した API キー
- 自分がホストとして入っている Google Meet

入退室だけなら `npm install` は不要。この CLI は追加パッケージを使わない。

## 2. API キー

Recall のアカウントはリージョンごとに別になる。東京以外で作ったキーを `ap-northeast-1` に向けると **401** になる。

1. [Recall.ai](https://www.recall.ai/) で東京リージョンのワークスペースに入る。
2. そのワークスペースで API キーを発行する。
3. キーはチャットや Git に貼らない。

## 3. ローカルの設定

```powershell
cd "c:\Users\IBUKI\Documents\東北大学\26JPHACKS\sd_2603"
node -v
copy .env.example .env
```

`.env` を開き、キーだけ入れる。リージョンはそのままにする。

```
RECALL_API_KEY=ここにキー
RECALL_REGION=ap-northeast-1
```

`.env` は Git の対象外。スクリプトは実行した場所ではなく、常に `sd_2603/.env` を読む。

引数なしで起動すると使い方が出て、終了コードは 2 になる。

```powershell
npm run recall
```

## 4. 会議を作る

1. ブラウザで [meet.new](https://meet.new) を開く。
2. 自分は会議に入ったままにする。
3. アドレス欄の URL をコピーする。形は `https://meet.google.com/abc-defg-hij`。`http://` は拒否される。

## 5. 入室

```powershell
npm run recall -- join --url "https://meet.google.com/abc-defg-hij"
```

`--` は必須。これがないと、URL が npm 自身の引数になる。

成功するまでの表示は次の順になる。

```text
ボットを送信しました 01234567-89ab-cdef-0123-456789abcdef
2026-10-17T02:00:00.000Z  joining_call
2026-10-17T02:00:05.000Z  in_waiting_room
Meet で MTG Lab の参加を許可してください
2026-10-17T02:00:20.000Z  in_call_not_recording
入室しました (in_call_not_recording)
```

`in_waiting_room` と出たら、Meet の参加者申請で **MTG Lab** を許可する。CLI は許可ボタンを押せない。許可されるとコマンドが終わり、終了コードは 0 になる。ボット ID は `sd_2603/.recall/current.json` に保存される。このファイルも Git には入らない。

この時点では録画も文字起こしも始まらない。会議に参加者が見えることが完了条件。

許可しないまま約 9 分たつと、次の表示で終了コード 1 になる。

```text
ホストが許可していません。timeout_exceeded_waiting_room
```

## 6. 状態を見る

```powershell
npm run recall -- status
```

ボットは新しく作らない。保存済み ID の状態変化を時刻順に表示する。入室後の最終行は `in_call_not_recording`。状態ファイルが無いときは終了コード 1。

## 7. 退出

```powershell
npm run recall -- leave
```

Meet から **MTG Lab** が消え、次のように出て終了コード 0 になる。

```text
退出しました (call_ended)
```

状態ファイルは成功時に削除される。すでに退出済みなら `すでに退出しています` と出て、同じ成功扱いになる。

ID を直接指定することもできる。

```powershell
npm run recall -- leave --id 01234567-89ab-cdef-0123-456789abcdef
```

`join` の待機中に Ctrl+C しても、そのボットへ退出が 1 回送られる。会議室に残さない。

## 8. チャットからアジェンダを受ける

`RECALL_CHAT_WEBHOOK_URL` が空なら、入室ボディは `recording_config: null` のままです。公開 HTTPS を入れると、その URL へチャット本文だけを送り、録画の保存期間は null にします。ボットは入室時に、アジェンダの書き方をチャットへピン留めします。署名検証用の `RECALL_WEBHOOK_SECRET` もサーバーに置きます。複数アジェンダと検証結果は `docs/agenda-from-chat.md` です。

## 9. もう一度入る

入室中にもう一度 `join` すると拒否される。`leave` で退出したあとに、新しい URL で `join` できる。同時に送れるボットは 1 体。

## うまくいかないとき

| 表示 | 対処 |
| --- | --- |
| `RECALL_API_KEY がありません` | `sd_2603/.env` にキーがあるか確認する |
| `401` | キーを発行したリージョンと `RECALL_REGION` を揃える |
| `507` | 短時間に作りすぎ。少し待って 1 回だけ再実行する |
| `meeting_requires_sign_in` | その会議は Google ログイン必須。この CLI では再送しない |
| `ホストが退出させた` | Meet 側でボットを削除した |
| `すでにボットが会議にいます` | `npm run recall -- leave` してから入り直す |
| `状態ファイルがありません` | 先に `join` する |
