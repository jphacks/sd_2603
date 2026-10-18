# PR #35 text評価 — 逐次進捗

## 計画固定

- 出典PR: https://github.com/jphacks/sd_2603/pull/35
- 対象コミット: `90d82bd6968b4d2163c01a72319003869df2b7b7`。
- 対象はdatasetsのcanvas54/derail36/derail-hard47/derail-multi32、計169台本。WAV、ASR、Canvas画像の認識は対象外。
- 入力はagendaと話者付きutterancesのtextのみ。原本label/humanAgreement/note/scenario/category/group/phase/expectedNudge等を除き、IDを匿名化。既存humanAgreementを人間確認の証明として使わない。
- 新しいラベル担当が全169件を独立に意味3分類。境界例は除外せずuncertainと代替ラベルを保存。GPT silverで人間goldではない。
- ラベル完成・schema/根拠・inputHash検証・hash固定が終わるまで、Jev呼び出しとテスト担当の実測開始を行わない。
- 別の新しいテスト担当が固定ラベルを受領して実測。質問・閾値の探索やラベル修正はしない。
- 比較設定は現行v3/0.6・0.6・0.6/WAIT0.4と前回選択v4/0.5・0.6・0.8/WAIT0.4。モデルJev1.14.0、入力は両設定・ラベル担当と同一のagenda/text。phaseを推測・追記しない。
- 判定だけを比較するため前回介入から120秒を合成条件として固定。発話数が少ないケースも除外せず、既存runtimeゲートを適用し、影響数を明示。
- Accuracy/Macro-F1/混同行列/クラス別Precision・Recall/介入二値/データセット別/uncertain別を記録。169件には同系列の切断・長短版があり、独立169会議とは称さない。原本groupは分布報告に使えるが閾値探索には使わない。
- Gatewayは最初10件で速度/料金を再点検し、以降成功キャッシュを再利用。最大400試行・保守的予約$1、並列3。失敗分のみ再開し、API失敗を正解や成功として扱わない。
- 現在ブランチ`codex/jev-pr35-evaluation`。未追跡の既存`docs/jevno-demo-script.md`には触れない。PRやstagingはマージしない。

## 進捗

- PR取得と4つの原本JSONのSHA固定が完了。169件すべてを匿名化し、agenda/textの完全一致重複は0。
- ラベル担当`pr35_labeler`（履歴を引き継がない新しい担当）を開始。Jev呼び出し0。テスト担当はまだ起動していない。

- 独立ラベル169件が完了。全ID・入力hash・根拠index・schemaを統合側でも照合し、label-freeze.jsonへ原本hashを固定。分布{'OK': 124, 'INTERVENE_DRIFT': 27, 'INTERVENE_STALLED': 18}、uncertain24件。除外なし。固定前Jev呼び出し0。これから別の新しいテスト担当を起動する。

## 実測完了・統合確認

- 別テスト担当によるpilot10件は全成功。その後、成功pilotを再利用して全336要求（168 eligible×2設定）を実行、失敗・再試行0。2発話の1件は既存runtimeゲートでAPI不要だが、主分母169件に保持。
- v3は159/169（94.08%, Macro-F1 0.9131）、固定v4は162/169（95.86%, 0.9389）。常にOKなら124/169（73.37%）。不確実24件を除外せず、gold・閾値・質問の変更なし。
- v4は誤介入9→5、停滞見逃し1→2。正解数差は不確実24件で発生（v3 15/24、v4 18/24）。確信145件は両方144/145。結果だけで一律の改善・本番精度とは言わない。
- 全169会話は正規化しても完全一致重複0。ただし同じagendaで長短会話が正確なprefixとなる66組を検出し、相関した台本であることを明記。前回772行との完全一致0は意味的独立性の保証ではない。
- 統合担当が336個の保存済みAPI payloadを検証。入力はagenda/text/固定質問のみ、全要求がラベル固定後。分類・正解数・混同行列・Macro-F1をPythonで独立再計算して一致。全入力/ラベル/プロトコルSHA不変。verification.jsonへ記録。
- キーなしの--report-onlyで追加API0を確認。ledgerは336試行のまま。raw usageとGateway費用推定$0.022045884、保守的予約$0.390600を保存。請求総額とは区別。
- 実測timeout15秒/production5秒の違いを記録。実測最大4,641ms、5秒超0。将来のレイテンシ同等性は主張しない。
- 全103テスト成功。新規評価コードのLint警告は解消し、専用4テスト再確認。全体Lintは既存recall.test.mjsの警告1のみ、エラーなし。Next.jsコードを変更していないため追加ビルドは不要。
- docsのREADME/ERRORSへ結果・不一致・分母・出典・限界・再現手順を統合。アプリ既定設定・UI・既存未追跡docs/jevno-demo-script.mdは変更なし。PR/stagingはマージせず、新しい評価ブランチへ保存する。

## 最終保存の確認

- 成果物コミット`bc74364`を`origin/codex/jev-pr35-evaluation`へPushし、HEADとremote追跡refの一致を確認。Gitへ保存された入力・ラベル・質問・report/cacheのバイト列SHAも固定値と一致した。
- ラベル担当→hash固定→別テスト担当の順序を実行時刻・コミットで保存。評価後の再チューニング、参照ラベル変更、アプリ変更、PR/stagingマージはなし。
- 既存の未追跡`docs/jevno-demo-script.md`のみ作業ツリーへ残る。内容には触れていない。
- この確認ログを追記したコミットも同じ評価ブランチへPushする。
