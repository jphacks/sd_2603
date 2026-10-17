# 統合担当への契約差分と取り込み手順

## 変えない意味

最終確認時の統合側はv3（HEAD7f66361）。現在合意された議題とphase、観測末尾を基準とする。無益な別話題の継続=DRIFT、新情報/基準/選択肢/次の一歩のない反復=STALLED。両方が介入を要する場合はSTALLED優先。許可休憩、有益な寄り道、実際に復帰した話題、進行中の根拠比較は正例にしない。3発話未満やcooldownで結果が隠れないよう、全新規例は7〜12発話・120秒経過に固定。

## 取り込み上の注意

`integration-snapshot.json` のHEAD/hashが読取時点の基準。統合側の質問やthresholdをこちらで編集していない。API、score cache、TestのJev予測は一切使っていない。

現行の `assertProvenance` は合成をTrainに限定するため、今回のユーザー指定「文献から作成したValidation/Test」と契約が異なる。合成をreal-roleplayと偽ったり、groupを書き換えて既存guardを回避しない。統合側で新たな評価用合成の許可を**明示的に**追加する場合は、最低限次を検証する。

1. kind=research_authored / dataKind=synthetic、creatorと引用する研究定義を保持。実録でないことをレポートする。
2. sourceGroupごとにsplitが一意。同じ機序族4例をVal/Testに分散しない。既存Trainに新規例を入れない。
3. authored-version、入力本文hash、銀ラベルhash、初回manifestをfreeze。変化したら新しい実験ディレクトリを使う。
4. gold/annotation/source intentをJevリクエストに入れず、agenda/transcriptだけを使用。
5. Validationでのみprompt/threshold選択。Testはその後の固定評価、結果を見て再選択しない。

データファイルは最終梱包後 `data/positive-validation.json` / `positive-test.json`。行のagenda/transcript/sourceGroup/split/gold/secondsSinceLastInterventionは既存coreの一般形式に合わせる。ただし上記の既存provenance guardは通らない想定で、変更は統合担当に委ねる。本担当は公開済みAPIキーを利用したりGateway実行したりしない。

## 数字の示し方

追加セット単独は正例のみなので、脱線/停滞それぞれのRecall、介入見逃し率、API失敗率を見る。OK support=0のままPrecision/誤介入率を一般化しない。silver-label一致率と人手gold accuracyを区別する。

既存のAMI正常例と結合する場合も、実録/創作/データセット版ごとの結果と採用比率を併記する。バランス調整した『実録＋創作の診断セットでの一致率』を、自然な日本語会議の正解率80%や実録のみの正解率として発表しない。

今回の生成者は意味定義を揃えるためv1/v2/v3質問文を読んでいる。この点で完全に外部独立な設計ベンチマークではない。新規本文の個別改訂とgenerator-family分離は、単なる議題差替えや表現丸暗記への偏りを抑えるための対策であり、一般化を証明するものではない。
