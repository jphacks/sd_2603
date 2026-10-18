# 日本語合成会議ベンチマーク — Jev tuning

- Dataset SHA256: `00f480a9493577386289dd3571c2b8d3f201852b153a37e16fc04e6ab9f76f5a`
- Split manifest SHA256: `5b7a3dfc4e806be76773901135d2cdd4629ceb2ff9ac34fb0cff8325a2239eb7`
- Protocol SHA256: `42ba9394d64e0fb473dc20b1433b0016cfa941e65b4a1cd853e9528001c9ca56`
- Model: typesafe-ai/jev-1.14.0; cases 500; Train/Validation/Test 300/100/100
- Test status: COMPLETE: no API errors
- 生成系列単位の分離。参照ラベルは独立したGPT作業によるsilverで、人間gold・実会議精度ではない。
- 生成意図に合わせたラベル修正・不一致例の都合のよい除外を行わない。独立したWAIT/SILENCEラベルはないため意味3分類のみ評価。

## Train-only fivefold group cross-validation

閾値は各foldで残り4foldから選択し、除外foldに評価。表はOOF予測の集計で、Validation/Testは未使用。

| Prompt | n | OOF accuracy | OOF Macro-F1 |
| --- | ---: | ---: | ---: |
| v2 | 300 | 99.3% | 0.994 |
| v4 | 300 | 99.0% | 0.990 |
| v3 | 300 | 98.7% | 0.987 |

| Fold | Fit groups | Heldout groups | Cases |
| --- | ---: | ---: | ---: |
| 0 | 48 | 12 | 60 |
| 1 | 48 | 12 | 60 |
| 2 | 48 | 12 | 60 |
| 3 | 48 | 12 | 60 |
| 4 | 48 | 12 | 60 |

| Fold | Prompt | Fitted thresholds | Heldout accuracy | Heldout Macro-F1 |
| --- | --- | --- | ---: | ---: |
| 0 | v2 | {"questionVersion":"v2","driftThreshold":0.6,"stallThreshold":0.7,"relevanceThreshold":0.6,"uncertainThreshold":0.4} | 98.3% | 0.984 |
| 0 | v3 | {"questionVersion":"v3","driftThreshold":0.5,"stallThreshold":0.7,"relevanceThreshold":0.6,"uncertainThreshold":0.4} | 98.3% | 0.984 |
| 0 | v4 | {"questionVersion":"v4","driftThreshold":0.5,"stallThreshold":0.6,"relevanceThreshold":0.6,"uncertainThreshold":0.4} | 98.3% | 0.984 |
| 1 | v2 | {"questionVersion":"v2","driftThreshold":0.6,"stallThreshold":0.7,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 100.0% | 1.000 |
| 1 | v3 | {"questionVersion":"v3","driftThreshold":0.4,"stallThreshold":0.8,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 98.3% | 0.984 |
| 1 | v4 | {"questionVersion":"v4","driftThreshold":0.5,"stallThreshold":0.6,"relevanceThreshold":0.8,"uncertainThreshold":0.4} | 100.0% | 1.000 |
| 2 | v2 | {"questionVersion":"v2","driftThreshold":0.6,"stallThreshold":0.7,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 98.3% | 0.984 |
| 2 | v3 | {"questionVersion":"v3","driftThreshold":0.4,"stallThreshold":0.8,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 98.3% | 0.984 |
| 2 | v4 | {"questionVersion":"v4","driftThreshold":0.5,"stallThreshold":0.6,"relevanceThreshold":0.8,"uncertainThreshold":0.4} | 98.3% | 0.981 |
| 3 | v2 | {"questionVersion":"v2","driftThreshold":0.6,"stallThreshold":0.7,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 100.0% | 1.000 |
| 3 | v3 | {"questionVersion":"v3","driftThreshold":0.4,"stallThreshold":0.7,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 98.3% | 0.981 |
| 3 | v4 | {"questionVersion":"v4","driftThreshold":0.5,"stallThreshold":0.6,"relevanceThreshold":0.8,"uncertainThreshold":0.4} | 100.0% | 1.000 |
| 4 | v2 | {"questionVersion":"v2","driftThreshold":0.6,"stallThreshold":0.7,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 100.0% | 1.000 |
| 4 | v3 | {"questionVersion":"v3","driftThreshold":0.4,"stallThreshold":0.7,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 100.0% | 1.000 |
| 4 | v4 | {"questionVersion":"v4","driftThreshold":0.6,"stallThreshold":0.6,"relevanceThreshold":0.8,"uncertainThreshold":0.4} | 98.3% | 0.984 |

## Validation selection

上位2つのTrain-CV候補と従来v3のみを比較し、Macro-F1→Accuracy→従来閾値への近さで選択。Testは選択に使わない。

| Policy | Accuracy | Macro-F1 |
| --- | ---: | ---: |
| {"questionVersion":"v3","driftThreshold":0.6,"stallThreshold":0.6,"relevanceThreshold":0.6,"uncertainThreshold":0.4} | 99.0% | 0.989 |
| {"questionVersion":"v2","driftThreshold":0.6,"stallThreshold":0.7,"relevanceThreshold":0.7,"uncertainThreshold":0.4} | 99.0% | 0.990 |
| {"questionVersion":"v4","driftThreshold":0.5,"stallThreshold":0.6,"relevanceThreshold":0.8,"uncertainThreshold":0.4} | 100.0% | 1.000 |

Selected: `{"questionVersion":"v4","driftThreshold":0.5,"stallThreshold":0.6,"relevanceThreshold":0.8,"uncertainThreshold":0.4}`

## Frozen final Test — synthetic only

| Setting | Correct / n | Accuracy | Macro-F1 | Majority | OKへの誤介入 | API errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline v3 | 100/100 | 100.0% | 1.000 | 40.0% | 0.0% | 0 |
| Selected | 100/100 | 100.0% | 1.000 | 40.0% | 0.0% | 0 |

Binary intervention diagnostics (does not check correct intervention reason):

| Setting | Precision | Recall | F1 | TP | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline v3 | 100.0% | 100.0% | 1.000 | 60 | 0 | 0 |
| Selected | 100.0% | 100.0% | 1.000 | 60 | 0 | 0 |

Family bootstrap95% accuracy interval: 100.0%–100.0% (20 groups;1000 replicates; seed20261018).

The empirical bootstrap interval is degenerate; it is not a guarantee about unseen meetings. Resampling observed error-free cases cannot reveal unobserved errors.

Baseline already reaches100% on this Test. No Test accuracy improvement is established; this ceiling result limits benchmark discrimination.

### Baseline confusion

| Gold / Predicted | Drift | Stalled | OK |
| --- | ---: | ---: | ---: |
| INTERVENE_DRIFT | 30 | 0 | 0 |
| INTERVENE_STALLED | 0 | 30 | 0 |
| OK | 0 | 0 | 40 |

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| INTERVENE_DRIFT | 30 | 100.0% | 100.0% | 1.000 |
| INTERVENE_STALLED | 30 | 100.0% | 100.0% | 1.000 |
| OK | 40 | 100.0% | 100.0% | 1.000 |

### Selected confusion

| Gold / Predicted | Drift | Stalled | OK |
| --- | ---: | ---: | ---: |
| INTERVENE_DRIFT | 30 | 0 | 0 |
| INTERVENE_STALLED | 0 | 30 | 0 |
| OK | 0 | 0 | 40 |

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| INTERVENE_DRIFT | 30 | 100.0% | 100.0% | 1.000 |
| INTERVENE_STALLED | 30 | 100.0% | 100.0% | 1.000 |
| OK | 40 | 100.0% | 100.0% | 1.000 |

Uncertain cases remain in primary denominator. Secondary slices (not used for selection):

| Slice | n | Accuracy |
| --- | ---: | ---: |
| Not flagged uncertain | 99 | 100.0% |
| Flagged uncertain | 1 | 100.0% |

## Cost and scope

Campaign attempts 1401; successful cached requests 1400; input tokens 1943758; published input-price estimate $0.077750; reserved envelope $1.557993. Invoice total is not measured.

500/1000 cases are correlated authored scenarios, not independent real meetings. Authors span splits, and GPT judges share model-family biases. Benchmark-specific80% does not establish Japanese real-meeting80%. Source research supports mechanisms, not these synthetic gold labels. No Test-result-driven reselection. UI/runtime policy adoption is separate and must preserve truthful threshold display.
