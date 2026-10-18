# Synthetic-only campaign

See [preregistered plan](../../docs/jev-tuning/synthetic-evaluation-plan.md) and [progress](../../docs/jev-tuning/progress-synthetic.md). This is a new synthetic evaluation contract, not a workaround disguising authored holdouts as real transcripts.

All commands accept `--data=.../cases.json`, `--split-manifest=.../split-manifest.json`, `--out=...` and optional `--campaign=...` for cache/ledger isolation. Default data is the Pro synthetic-benchmark-v1 directory. Use a new output directory after any dataset or annotation change. The campaign cache can be reused because it excludes gold labels and includes agenda+phase, model and full questions.

```sh
node evals/tuning/synthetic-run.mjs validate
node --env-file=.env.local evals/tuning/synthetic-run.mjs pilot
node --env-file=.env.local evals/tuning/synthetic-run.mjs score-train
node evals/tuning/synthetic-run.mjs cross-validate
node --env-file=.env.local evals/tuning/synthetic-run.mjs score-validation
node evals/tuning/synthetic-run.mjs select
node --env-file=.env.local evals/tuning/synthetic-run.mjs final
node evals/tuning/synthetic-run.mjs report
```

The default output directory contains the dataset hash, so it changes as incomplete delivery grows. Pilot and training scores may run on independently labeled partial snapshots. CV/Validation/final require all declared cases and >=500 complete labeled examples. No partial subset is reported as the500-case benchmark. Do not run two processes in one campaign; an exclusive lock protects the budget/cache. A stale lock after SIGKILL must only be removed after confirming no writer remains.

Default concurrency3, bounded maximum4. New campaign budget defaults to4000 attempts and$4 conservative reservation; real invoice cost is not derived from this envelope. Score-train calls only Train; CV adds zero API calls; Validation calls only the predeclared shortlist; final calls only current-v3 baseline and selected version on Test. Gates cannot inflate synthetic scores:6–12turns, explicit phase and120s since last intervention are required. Labels are independent GPT silver and are not UI action names.

## Optional1000-case extension

The Pro authoring branch predeclares a separate extension manifest. `node evals/tuning/combine-synthetic-manifests.mjs` verifies the original core500 raw SHA256 and the declared extension hash, then concatenates group/case assignments without moving any core case. Use `--split-manifest=evals/tuning/runs/synthetic-v1/combined-split-manifest.json` with the complete1000-case export. A500-case subset under that manifest remains incomplete and cannot reach Validation/final. Freeze dataset size before Validation selection. Core500 and full1000 releases must be separately identifiable; do not reuse a scored core Test to tune the full version.
