# Jev tuning experiment

- Dataset SHA256: `db57f545163e27633dc86920a8f7ca89d58e79835b17532a3c41f1494b9bfa44`
- Model: `typesafe-ai/jev-1.14.0`; prompt SHA256: `7416bf9b8dcff866bc239c9c08ecc98ca2dae5c8a3a7aff708de68b8807bfd8c`
- Selection: validation semantic Macro-F1; test evaluated after selection freeze.
- Reference: GPT/agent silver labels, not human-established gold.
- Default production policy is not automatically changed by this script. UI names and displayed thresholds remain intact; a separate prompt-only candidate is frozen on validation before test.

| Parameter | Baseline | Selected |
| --- | --- | --- |
| questionVersion | v1 | v2 |
| driftThreshold | 0.6 | 0.8 |
| stallThreshold | 0.6 | 0.7 |
| relevanceThreshold | 0.6 | 0.6 |
| uncertainThreshold | 0.4 | 0.4 |

UI-compatible production candidate (selected before test): {"questionVersion":"v3","driftThreshold":0.6,"stallThreshold":0.6,"relevanceThreshold":0.6,"uncertainThreshold":0.4}. Criterion: Validation semantic Macro-F1 with original UI-compatible thresholds fixed.

| Split / setting | n | Semantic accuracy | Macro-F1 | Majority baseline | Action accuracy | API errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Validation baseline | 20 | 60.0% | 0.250 | 90.0% | not labeled | 0 |
| Validation selected | 20 | 90.0% | 0.536 | 90.0% | not labeled | 0 |
| Test baseline | 20 | 65.0% | 0.271 | 95.0% | not labeled | 0 |
| Test selected | 20 | 85.0% | 0.315 | 95.0% | not labeled | 0 |
| Test UI-compatible prompt candidate | 20 | 70.0% | 0.283 | 95.0% | not labeled | 0 |

## Validation baseline

Case-level Wilson 95%: 38.7% – 78.1%; correlated windows reduce effective sample size.

| Gold / Predicted | Drift intervention | Stalled intervention | OK |
| --- | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0 | 0 |
| INTERVENE_STALLED | 0 | 0 | 2 |
| OK | 3 | 3 | 12 |

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0.0% | N/A | 0.000 |
| INTERVENE_STALLED | 2 | 0.0% | 0.0% | 0.000 |
| OK | 18 | 85.7% | 66.7% | 0.750 |

False intervention rate on OK: 33.3%.

## Validation selected

Case-level Wilson 95%: 69.9% – 97.2%; correlated windows reduce effective sample size.

| Gold / Predicted | Drift intervention | Stalled intervention | OK |
| --- | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0 | 0 |
| INTERVENE_STALLED | 0 | 2 | 0 |
| OK | 0 | 2 | 16 |

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | N/A | N/A | 0.000 |
| INTERVENE_STALLED | 2 | 50.0% | 100.0% | 0.667 |
| OK | 18 | 100.0% | 88.9% | 0.941 |

False intervention rate on OK: 11.1%.

## Test baseline

Case-level Wilson 95%: 43.3% – 81.9%; correlated windows reduce effective sample size.

| Gold / Predicted | Drift intervention | Stalled intervention | OK |
| --- | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0 | 0 |
| INTERVENE_STALLED | 1 | 0 | 0 |
| OK | 2 | 4 | 13 |

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0.0% | N/A | 0.000 |
| INTERVENE_STALLED | 1 | 0.0% | 0.0% | 0.000 |
| OK | 19 | 100.0% | 68.4% | 0.813 |

False intervention rate on OK: 31.6%.

## Test selected

Case-level Wilson 95%: 64.0% – 94.8%; correlated windows reduce effective sample size.

| Gold / Predicted | Drift intervention | Stalled intervention | OK |
| --- | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0 | 0 |
| INTERVENE_STALLED | 1 | 0 | 0 |
| OK | 0 | 2 | 17 |

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0.0% | N/A | 0.000 |
| INTERVENE_STALLED | 1 | 0.0% | 0.0% | 0.000 |
| OK | 19 | 100.0% | 89.5% | 0.944 |

False intervention rate on OK: 10.5%.

## Test UI-compatible prompt candidate

Case-level Wilson 95%: 48.1% – 85.5%; correlated windows reduce effective sample size.

| Gold / Predicted | Drift intervention | Stalled intervention | OK |
| --- | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0 | 0 |
| INTERVENE_STALLED | 1 | 0 | 0 |
| OK | 2 | 3 | 14 |

| Class | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| INTERVENE_DRIFT | 0 | 0.0% | N/A | 0.000 |
| INTERVENE_STALLED | 1 | 0.0% | 0.0% | 0.000 |
| OK | 19 | 100.0% | 73.7% | 0.848 |

False intervention rate on OK: 26.3%.

## Prompt comparison — validation only

All 648 configurations are saved in search.json; this table reports unchanged-threshold and best-per-prompt performance.

| Prompt | Baseline-threshold accuracy | Baseline-threshold Macro-F1 | Best accuracy | Best Macro-F1 |
| --- | ---: | ---: | ---: | ---: |
| v1 | 60.0% | 0.250 | 85.0% | 0.306 |
| v2 | 70.0% | 0.457 | 90.0% | 0.536 |
| v3 | 75.0% | 0.470 | 85.0% | 0.494 |

## Training diagnostics — not heldout accuracy

| Prompt | Kind | n | Accuracy | Macro-F1 |
| --- | --- | ---: | ---: | ---: |
| v1 | real | 60 | 83.3% | 0.496 |
| v1 | synthetic | 36 | 100.0% | 1.000 |
| v2 | real | 60 | 76.7% | 0.472 |
| v2 | synthetic | 36 | 97.2% | 0.972 |
| v3 | real | 60 | 80.0% | 0.517 |
| v3 | synthetic | 36 | 97.2% | 0.972 |

## Group holdout robustness — development only

Prompt/threshold chosen without the outer group; outer groups are never final test data.

| Heldout series | n | Accuracy | Macro-F1 |
| --- | ---: | ---: | ---: |
| ES2002 | 8 | 100.0% | 1.000 |
| ES2003 | 8 | 100.0% | 1.000 |
| ES2008 | 8 | 100.0% | 1.000 |
| ES2010 | 8 | 100.0% | 1.000 |
| ES2012 | 8 | 100.0% | 1.000 |
| IS1005 | 8 | 100.0% | 1.000 |
| IS1006 | 8 | 100.0% | 1.000 |
| IS1007 | 8 | 100.0% | 1.000 |
| IS1009 | 8 | 100.0% | 1.000 |
| TS3009 | 8 | 100.0% | 1.000 |
| TS3010 | 8 | 100.0% | 1.000 |
| TS3012 | 8 | 100.0% | 1.000 |
| ES2014 | 5 | 80.0% | 0.296 |
| IS1002 | 5 | 100.0% | 0.333 |
| TS3005 | 5 | 80.0% | 0.296 |
| TS3007 | 5 | 100.0% | 0.333 |

## Cost and limitations

Global attempts: 440; reserved envelope $1.957. This is not invoice cost. Cache hits incur no new calls. Optional upstream usage and latency are in attempts.jsonl; transcripts and credentials are not logged there.

LLM agreement is not human accuracy. AMI role-play, English transcripts, inferred agenda, truncated windows, absent minority classes and correlated GPT judgments limit generalization to Japanese live meetings. Absent classes receive F1=0; API failures count as incorrect. WAIT vs SILENCE requires independent action labels; do not infer them from semantic OK. No learning-rate/epoch training is performed. Synthetic examples are never heldout test examples.
