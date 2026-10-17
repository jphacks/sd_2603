# Jev tuning implementation progress

## Status — 2026-10-18 JST

- Branch: `codex/jev-tuning-implementation`, fresh `origin/staging` base `e1d94f0`.
- Pre-existing edits preserved in `stash@{0}` (`preserve pre-tuning implementation 2026-10-18`); original branch `feature/jev-score-monitor`. Stash will not be dropped.
- Data partner: `origin/codex/jev-tuning-data` (initial progress commit `f829de1`). No datasets or labels published there at initial fetch.
- Production action names, reason strings, messages and UI labels stay unchanged.

| Requested task | Owner / approach | State |
| --- | --- | --- |
| 1. GitHub evidence | Coordinator: Markdown run reports, before/after policies, metrics, reproduction, limitations | In progress |
| 2. Public evaluation excerpts | Pro branch: 50–100 real excerpts, provenance/license; implementation audits split and source IDs | Waiting for published data; extraction prework preserved |
| 3. Synthetic train conversations | Pro branch: training sources only, independent labels | Waiting for published data |
| 4. Judge / tuning / measurement | Runtime agent: versioned prompts/policy; harness agent: metrics/search; coordinator: cached live calls, frozen selection and one final test | In progress |
| 5. 30+ criteria per parameter | Pro branch; runtime implements rubric candidates when available | Waiting for published criteria |

## Execution and evaluation contract

1. Review source grouping and frozen dataset fingerprint before calls. Keep synthetic variants with parent group. No test-derived generation.
2. Independent GPT agents produce silver labels; no paid text-generation Judge in this branch. Preserve disagreements and annotation provenance.
3. Pilot 10 development examples first. Record latency, optional upstream usage, estimated cost assumptions. Never claim invoice cost from missing usage.
4. Cache raw validated Jev scores by full input, model and question specification. Reuse scores for offline threshold grid search / group validation.
5. Select question version and thresholds using validation only. Lock artifact hashes before final test. No test-informed reselection.
6. Report 3-class agreement (UI-equivalent), action agreement when labels support it, Macro-F1, per-class metrics, confusion, majority baseline, errors and uncertainty.
7. Verify regression tests, typecheck, lint/build as appropriate. Commit and push implementation branch only; no staging merge.

## Activity

- Refreshed both remote refs; preserved uncommitted work; created fresh branch.
- Started three bounded subagents: runtime changes, metric/search core, independent read-only audit.
- Next: implement live runner while agents work; fetch Pro increments; pilot then tune.

## Limits

LLM labels are machine reference labels, not independently established human ground truth. Accuracy on English AMI role-play excerpts cannot establish Japanese live-meeting accuracy. Costs are estimated unless upstream provides billing usage.

### 00:47 JST — pilot and runtime

- Versioned runtime prompts v1/v2/v3 and validated policy implemented; baseline production thresholds and UI unchanged.
- Offline search, confusion matrices, per-class metrics, gate handling, leakage checks implemented and unit-tested.
- Legacy synthetic development pilot: 10/10 responses, zero API errors, median 309 ms, p95 753 ms. Upstream token usage returned for all 10; invoice not inspected.
- Sandbox DNS prevented first ten attempts before network-enabled retry; recorded as failed attempts, not successful requests or measured API cost.
- Independent audit fixed gate mismatch, final-test retry lock, source-series requirement, selection criterion reporting. CLI integration tests in progress.
- Partner data still pending initial published dataset; integration contract prepared in data-contract.md.
