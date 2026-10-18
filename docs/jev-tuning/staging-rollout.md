# Jev v4のstaging反映と切り戻し

ユーザーがstagingへの反映を指定した2026-10-18の変更。Production/mainへは反映しない。追加学習した重みではなく、Jev1.14.0の質問定義v4と閾値を、最新stagingの4質問方式へ統合する。診断上のバージョンはv4-staging-gated。

## 適用する設定

`lib/judge/jev-policy.json`をアプリ判定とモニター補助線の共通設定にする。

| 設定 | 値 |
| --- | --- |
| JevモデルID | typesafe-ai/jev-1.14.0 |
| 質問定義 | v4-staging-gated |
| drifted閾値 | 0.5 |
| stalled閾値 | 0.6 |
| tangentIsRelevant閾値 | 0.8（この値未満で脱線介入候補） |
| WAIT閾値 | 0.4 |
| interveneNowの介入ゲート | 0.6（最新stagingのまま） |

介入にはinterveneNow>=0.6も必要。停滞を優先し、脱線はdrifted>=0.5かつ有用性<0.8で介入。それ以外で脱線または停滞>=0.4ならWAIT。既存の60秒cooldown・3発話未満のゲート・介入文言・状態名は維持。モデル障害をmockへ切り替えない。

反映前の最新stagingは`efeb18ae38fd9f03a4e8504a642c33d7c93c4c79`で、4つ目の`interveneNow`も要求する質問v2方式。ユーザーの「最新stagingの改修に合わせる」指定に従い、4つ目の質問文・必須レスポンス・介入ゲート・diagnosticを維持する。先の3質問v4への置換案は採用していない。最初の3質問だけに固定済みv4定義を適用し、ゲート未満なら高い脱線/停滞スコアでもWAITとなる最新仕様を保つ。

UIの名称・レイアウトを変えず、補助線の数値/位置だけ0.5/0.6/0.8に合わせる。JSONから読むため、v3の元閾値へ戻す際も表示が同時に戻る。GitHub Actionsのstaging用実行時JEV_MODEL_IDも固定版にする（元のfloating alias指定を残すと固定モデルが上書きされるため）。

## 評価の根拠と限界

- 合成500件の系列分割：Train300/Validation100/Test100。Validationでv4/0.5・0.6・0.8を固定後、未使用Test100/100。現行比較v3も100/100のためTest改善差は確認できていない。
- PR35の追加台本text169件を再調整なしで評価：v4は162/169（95.86%）、比較v3は159/169（94.08%）。参照は独立GPT silverで実会議/人間goldではない。v4は誤介入9→5、停滞見逃し1→2のトレードオフ。
- 詳細：[評価ブランチの固定結果](https://github.com/jphacks/sd_2603/blob/fe5012ea3ad73f8a91f83a75943df35cf1edb104/docs/jev-tuning/pr35-text/README.md)。このstaging反映でデータやgoldを変更・再探索していない。

### 最新stagingへ合わせた統合版の再評価

過去の3質問v4の95.86%を、この4質問版へ流用しない。同じ固定済みの169件を追加学習/ラベル変更なしで再実測し、**163/169（96.45%）、Macro-F1 0.9468、APIエラー0**だった。実装が異なるため、以前の値との単純な改善比較にはしない。

168 eligibleケースへ4質問を送信し全件成功。2発話の1件は元のruntimeゲートでOK/WAITとし、主分母169へ含める。不確実24件も除外しない。最初10件をpilotとして確認し成功キャッシュを再利用。保守的予約$0.308371（請求総額ではない）。[設定・全ケース判定](staging-gated-evaluation.json)、[保存済みスコア](staging-gated-scores.json)。

原本は評価ブランチfe5012eのdocs/jev-tuning/pr35-text/blind-inputs.jsonおよびprimary-labels.json。rawSHAはそれぞれ607624f6ea951ae54016f1ddfc91342833fc5cd045f19d414e41a0b2357fd24c、813854262b30fbbcc142c56633b3a9348693a5f6bdf6ad5464d1f2921cdf235c。再現スクリプトはscripts/eval/jev-gated-check.mjsで、--inputs/--labelsに固定原本パスを渡す。--outに同じフォルダを指定すれば成功キャッシュを再利用する。複数プロセスで同時実行しない。

## デプロイ

GitHub ActionsはstagingへのPushからPreviewを公開する。AI_PROVIDER=jev/ALLOW_PAID_AI=trueは既存のstaging設定を維持し、他環境は変更しない。APIキーをソースへ保存しない。

Actionsの成功とPreview URLで、/api/judgeのdiagnostic.questionVersion=v4-staging-gated、model=typesafe-ai/jev-1.14.0を確認する。実API確認は合成の3発話以上で行い、会議への参加や音声の再生はしない。

## 反映前のstagingへ完全に戻す

反映コミットには`jev-v4-staging-20261018`タグを付ける。force pushやresetではなく、今回の変更だけrevertする。

```sh
git fetch origin --tags
git switch staging
git pull --ff-only origin staging
git revert jev-v4-staging-20261018
git push origin staging
```

Push後にActionsのPreviewデプロイ完了を確認する。これで4質問・interveneNowゲート・元の閾値/表示・floating aliasを含む反映前の実装へ戻る。後から別の変更が同じ箇所へ入った場合はrevertの競合を解決する。チームの他の変更を巻き戻すforce pushは行わない。

## 以前評価した3質問v3との違い

評価ブランチのv3は3質問方式であり、今回の最新staging（4質問+介入ゲート）の元実装とは異なる。単にJSONのversion文字列をv3へ変えても質問定義は切り替わらない。元に戻す場合は上記のrevert手順で今回の統合差分を戻す。v3のような別の方式を使いたい場合は、別変更として実装・評価する。

## 進捗

- 最新stagingを取得し、別worktree/作業ブランチから必要なruntime変更だけを用意。評価データや旧staging全体のmergeは行わない。
- 反映前stagingのSHAと復旧手順を保存。4質問ゲートを維持した版でテスト・ビルド・オフライン会議リプレイの確認中。

- 反映直前にstagingを再取得し、追加されたNode24ローカル有効化改修efeb18aもfast-forwardで取り込んだ。Jev/モニター/音声ワーカーへの追加差分は0で、4質問仕様は同一。
- ローカル全171テスト、Lint、型、Webpackビルド、SSRの補助線50/60/80・WAIT40確認、アプリ起動/Mockスモークを通過。会議リプレイは初回にテスト用portの一時的EADDRINUSEがあり、再実行では7ケースすべて成功した。
