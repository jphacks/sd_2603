# Jev reproducible prompt / threshold evaluation

This tooling does not train model weights. It compares three question specifications and 216 threshold combinations per specification, using cached Jev scores. Existing application names, UI, cooldown and insufficient-context gates stay intact.

## Commands

Node 24 and installed dependencies are required. Validation is offline. `pilot`, `score`, `final` send paid requests only when uncached; use `--env-file=.env.local` to load a server-side Gateway key.

```sh
npm run test:jev-tuning
node evals/tuning/run.mjs validate --data=path/to/cases.json --out=evals/tuning/runs/experiment-001 --require-provenance
node --env-file=.env.local evals/tuning/run.mjs pilot --data=path/to/cases.json --out=evals/tuning/runs/experiment-001 --require-provenance
node --env-file=.env.local evals/tuning/run.mjs score --data=path/to/cases.json --out=evals/tuning/runs/experiment-001 --require-provenance
node evals/tuning/run.mjs tune --data=path/to/cases.json --out=evals/tuning/runs/experiment-001 --require-provenance
node --env-file=.env.local evals/tuning/run.mjs final --data=path/to/cases.json --out=evals/tuning/runs/experiment-001 --require-provenance
```

Default model is pinned `typesafe-ai/jev-1.14.0`; override with `--model=...` consistently in every command. Production model selection remains existing `JEV_MODEL_ID`. Pilot uses ten development cases only; score never accesses test. Final freezes selection/dataset/question hashes before accessing heldout scores. Rerun resumes interrupted or failed test requests without changing selection; completed final tests cannot be rerun through the CLI. Do not manually bypass locks to retune on test results.

Each output directory has immutable dataset/model/question manifest, pilot, selection, final, attempts JSONL and Markdown reports. Shared success-only cache defaults to `runs/cache.json`; `--cache=...` and `--ledger=...` isolate test runs. Cache key includes input, model, questions and schema. Gold labels do not enter model requests. Failure attempts count against budget but are not reused. No credentials or transcript text are written to attempts logs.

Default caps are 500 attempts and a $2 conservative reservation envelope. New reservations use UTF-8 payload bytes × three questions × $0.04/M plus $0.00064/request overhead. Earlier fixed $0.005 reservations remain unchanged in the ledger. `--max-calls=` and `--budget-usd=` may reduce these. Payloads are bounded to 28,000 UTF-8 bytes. Reservation is not invoice cost; the pilot records upstream usage and estimates input cost against the [published $0.04/M starting input rate](https://vercel.com/ai-gateway/models/jev) checked 2026-10-18. Requests may have provider-specific billing; validate actual charges in Vercel. Do not run multiple writer processes against one cache/ledger.

## Dataset and metric contract

See [data contract](../../docs/jev-tuning/data-contract.md). Source series must not cross splits; normalized transcript duplicates are rejected. Synthetic examples require training parents and stay in train. `--require-provenance` enables these publication-data checks. Legacy synthetic regression data can run without that flag and is not fresh heldout evidence.

Two different metrics are reported:

- Existing actions: `SILENCE / WAIT / INTERVENE`, when independent `gold.action` labels exist. This is the primary selection criterion only when every validation case has an action label.
- Semantic outcomes: `INTERVENE_DRIFT / INTERVENE_STALLED / OK`. This checks intervention reason and is not a UI rename. It becomes selection criterion when action annotations are incomplete.

Macro-F1 is primary, accuracy breaks ties, closeness to baseline and earlier prompt break further ties. WAIT threshold remains 0.4 in this initial grid. All attempted cases remain in accuracy denominator; missing classes have F1=0. Group holdout analysis is development-only; final test is not included. Wilson case intervals are descriptive because windows within a meeting series are correlated.

v1 preserves original questions; v2 makes dimensions and exceptions explicit; v3 adds authored few-shot examples. Authored examples are not taken from heldout conversations. GPT annotation is machine silver, not human ground truth; repeat agreement does not remove shared model bias.

## Frozen-result inspection

`node evals/tuning/run.mjs report --data=evals/tuning/pro-final-cases.json --out=evals/tuning/runs/final-001 --require-provenance` renders reports offline without rerunning Test. `node evals/tuning/import-pro.mjs` imports only the audited `data/final/` packets and `labels-final.jsonl`; the earlier provisional import is retained as history and is not the final benchmark.

## Production adoption

Selection does not automatically overwrite `lib/judge/jev-policy.json`. Review validation support and UI compatibility first. Monitor currently displays fixed 60%/40% markers; preserve runtime default thresholds unless the displayed thresholds can remain truthful under the user-authorized UI scope. Report experimental optimal thresholds separately when they cannot be adopted. Never use final-test performance to select another configuration.
