# PR35 text-only Jev evaluation

Status: complete. All 169 cases included, including 24 uncertain labels.

| Policy | Correct | Accuracy | Macro F1 | Majority baseline |
|---|---:|---:|---:|---:|
| current-v3 | 159/169 | 94.08% | 0.9131 | 73.37% |
| frozen-selected-v4 | 162/169 | 95.86% | 0.9389 | 73.37% |

Synthetic scripts with independent GPT silver references; no human gold.

Agenda and speaker-prefixed text only; no ASR or canvas multimodal assessment.

Correlated prefix/full cases are not 169 independent meetings.

Fixed policies; no fitting on this dataset.

Reservation is conservative budget accounting, not an invoice.

Measurement fetch timeout 15 seconds versus production 5 seconds; this run does not establish deployment latency equivalence.

336 attempts, 336 cached successful scores. Reserved $0.390600. Usage and raw scores preserved in cache.json; full class precision/recall, confusion matrices, binary intervention and dataset/uncertainty/runtime-gate slices are in report.json. Provider-reported estimated cost (not invoice): $0.02204588.

## current-v3

| Class | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| INTERVENE_DRIFT | 87.10% | 100.00% | 0.9310 | 27 |
| INTERVENE_STALLED | 77.27% | 94.44% | 0.8500 | 18 |
| OK | 99.14% | 92.74% | 0.9583 | 124 |

Confusion matrix (rows reference; columns prediction):

| Reference | INTERVENE_DRIFT | INTERVENE_STALLED | OK |
|---|---:|---:|---:|
| INTERVENE_DRIFT | 27 | 0 | 0 |
| INTERVENE_STALLED | 0 | 17 | 1 |
| OK | 4 | 5 | 115 |

Binary intervention: `{"tp":44,"fp":9,"fn":1,"tn":115,"missing":0,"accuracy":0.9408284023668639,"precision":0.8301886792452831,"recall":0.9777777777777777}`

| Slice | N | Correct | Accuracy | Macro F1 |
|---|---:|---:|---:|---:|
| derail-hard | 47 | 38 | 80.85% | 0.7714 |
| canvas | 54 | 54 | 100.00% | 0.3333 |
| derail-multi | 32 | 31 | 96.88% | 0.9534 |
| derail | 36 | 36 | 100.00% | 1.0000 |
| certain | 145 | 144 | 99.31% | 0.9870 |
| uncertain | 24 | 15 | 62.50% | 0.6228 |
| gated | 1 | 1 | 100.00% | 0.3333 |
| eligible | 168 | 158 | 94.05% | 0.9130 |

## frozen-selected-v4

| Class | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| INTERVENE_DRIFT | 87.10% | 100.00% | 0.9310 | 27 |
| INTERVENE_STALLED | 94.12% | 88.89% | 0.9143 | 18 |
| OK | 98.35% | 95.97% | 0.9714 | 124 |

Confusion matrix (rows reference; columns prediction):

| Reference | INTERVENE_DRIFT | INTERVENE_STALLED | OK |
|---|---:|---:|---:|
| INTERVENE_DRIFT | 27 | 0 | 0 |
| INTERVENE_STALLED | 0 | 16 | 2 |
| OK | 4 | 1 | 119 |

Binary intervention: `{"tp":43,"fp":5,"fn":2,"tn":119,"missing":0,"accuracy":0.9585798816568047,"precision":0.8958333333333334,"recall":0.9555555555555556}`

| Slice | N | Correct | Accuracy | Macro F1 |
|---|---:|---:|---:|---:|
| derail-hard | 47 | 42 | 89.36% | 0.8766 |
| canvas | 54 | 54 | 100.00% | 0.3333 |
| derail-multi | 32 | 30 | 93.75% | 0.8981 |
| derail | 36 | 36 | 100.00% | 1.0000 |
| certain | 145 | 144 | 99.31% | 0.9870 |
| uncertain | 24 | 18 | 75.00% | 0.7222 |
| gated | 1 | 1 | 100.00% | 0.3333 |
| eligible | 168 | 161 | 95.83% | 0.9388 |
