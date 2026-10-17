# 正例追加セットの判定契約

統合側 `codex/jev-tuning-implementation` の実際のローカル作業状態とリモートを確認。commit・各ファイルhashは integration-snapshot.json に保存。統合側のアプリや作業中ファイルは変更しない。予測cacheやモデル評価結果はラベル作成に使わない。

## 共有する意味定義

- DRIFT: 現在合意されたagenda/phaseから別話題が複数ターン続き、議題に具体的な利益がなく、観測末尾でも戻っていない。許可された休憩やアイスブレイク、議題に有益なリスク確認、既に復帰した逸脱は除く。
- STALLED: 同じ主張や問い・解消しない障害が反復し、情報・選択肢・判断基準・決定・次の一歩が増えず、観測末尾でも未解決。根拠を比較する異論、発散、割当済み確認、明示的な思考時間だけでは該当しない。文字数や時刻欠損から沈黙を推測しない。
- 両方が介入を要する場合はSTALLED優先。正例はスコア閾値から逆算せず意味で判断し、問題を特定する根拠発話を記録する。
- 入力は agenda と話者付き transcript。モデルにはgold/reason/生成意図を渡さない。
- secondsSinceLastIntervention=120 とし、cooldown60秒を満たす。全例3発話以上。機能上のgateではなく意味判定を評価する。

## 現行実装との関係

production policy は questionVersion=v1、stall>=0.6優先、drift>=0.6かつrelevance<0.6で介入、uncertain>=0.4でWAIT。v2/v3候補はdriftの話題距離と有用性を分離し、phaseとlatest stateを明示する。v1では有益な寄り道がdrift定義自体から除かれる違いがある。本追加セットはどちらでも一貫する『無益な逸脱』と『観測可能な無進展反復』を正例にし、望ましいdefinitionを閾値やJev出力に合わせて変更しない。

## 評価範囲

①調査100件は実会話の個別事例も数える（ユーザー確認済み）。同じ論文の言い換えや同じ会話の重複を独立事例として水増ししない。
②文献/データセットに基づく実録抜粋または作成会話100件以上。抽出・翻訳・研究定義からの創作を明確に区別。創作は実会話の正例goldとは称さない。
Validation/Testへの追加は別バージョンのデータ構築。旧TestのJev予測を見て選び直さない。元会話/生成系列単位でsplitを固定し、Trainには加えない。正例のみの評価はクラス別Recall/見逃し率であり、3クラス全体Accuracy80%の証明ではない。

## インポータ契約差分

統合側 `evals/tuning/data.mjs::assertProvenance` は dataKind=synthetic ならsplit=trainと同じTrain parentを必須とする。この既存制約は旧データに適したものだが、ユーザーが今回明示依頼した『研究定義から作成したValidation/Test』を許可しない。新規会話をreal-roleplayなどに偽装して回避しない。出力はdataKind=syntheticのままにし、取り込み前に統合側が authored evaluation 専用の明示的な分岐・freeze・系列検証を追加する必要がある。アプリ/インポータの変更は本担当では行わない。

新規生成時には統合側のv1/v2/v3質問仕様を閲覧したが、Jev予測・score cacheは閲覧していない。従ってこれは明示されたbehavior contractの診断セットであり、質問設計から独立な外部ベンチマークではない。同一メカニズムの4例は必ず同split。既存Trainとの完全一致と文字列近傍を監査し、共通の概念・定義まで独立であるとは主張しない。
