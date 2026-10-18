# PR35ブランチの参照ラベルとの比較

- 取得コミット: `89511efa21568b57f2ac86a8b0e1c019ee830281`
- 比較相手: 前回固定した独立GPTラベル（commit9259e22）。再ラベル付けなし。
- 4データセットのバイト列は前回と完全一致。新規Gateway0回。
- `on_track` / `productive_tangent` → OK、`drift` → INTERVENE_DRIFT、`stalled` → INTERVENE_STALLEDへ対応。5分類をそのまま比較した値ではない。
- PR規則に従いCanvas54件（図表提示の別タスク）とambiguous23件を状態分類から除き、92件を比較。前回の169件分母と混ぜない。

| 比較対象 | 状態3分類一致 | 介入期待値一致 |
| --- | ---: | ---: |
| independent-labels | 91/92 (98.91%) | 97/100 (97.00%) |
| current-v3 | 87/92 (94.57%) | 91/100 (91.00%) |
| frozen-selected-v4 | 89/92 (96.74%) | 95/100 (95.00%) |

主たるラベル間比較はindependent-labels行。v3/v4行は保存済み予測を新しいPR参照へ再集計した補助値で、再実測や新たな設定選択ではない。

## 独立ラベルとの状態比較

| Dataset | 一致 |
| --- | ---: |
| derail | 30/30 (100.00%) |
| derail-hard | 36/36 (100.00%) |
| derail-multi | 25/26 (96.15%) |

### 不一致

- `derail-multi/i1-delay@35`: PR=on_track（OK）、独立ラベル=INTERVENE_STALLED。独立側uncertain=True、代替=OK。固定済み理由：納期を動かせない問題から責任論の押し問答となり対処案が止まる。

## 介入の一致は状態の一致と別

expectedInterventionが指定された100件で比較し、nullの15件は別扱い。expectedNudgeを優先するPRの規則をそのまま使用。状態がon_trackでも介入を期待する指定があり、stateの一致率と分母も意味も異なる。

| 原本humanAgreement注釈 | 独立ラベルから導く介入との一致 |
| --- | ---: |
| clear | 56/58 (96.55%) |
| split | 11/12 (91.67%) |
| unspecified | 30/30 (100.00%) |

介入側の不一致はcomparison.jsonへ全件保存。独立ラベルは介入期待値を別判定していないため、OK以外を介入とする写像での一致である。humanAgreementはPR作者の見込み注釈で実測の人間一致率ではない。PRラベルと独立GPTラベルの一致は、真の正解や実会議での精度の証明ではない。ambiguousを除くのは今回PRの比較規約であり、前回169件評価の分母や結果は変更しない。

再現: `python3 evals/tuning/compare-pr35-labels.py --ref=89511efa21568b57f2ac86a8b0e1c019ee830281`
