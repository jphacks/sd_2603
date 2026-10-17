# Jev tuning implementation progress

## Status — 2026-10-18 JST

- Branch: `codex/jev-tuning-implementation`, fresh `origin/staging` base `e1d94f0`.
- Pre-existing edits preserved in `stash@{0}` (`preserve pre-tuning implementation 2026-10-18`); original branch `feature/jev-score-monitor`. Stash will not be dropped.
- Data partner: `origin/codex/jev-tuning-data` (initial progress commit `f829de1`). No datasets or labels published there at initial fetch.
- Production action names, reason strings, messages and UI labels stay unchanged.

| Requested task | Owner / approach | State |
| --- | --- | --- |
| 1. GitHub evidence | Coordinator: Markdown run reports, before/after policies, metrics, reproduction, limitations | Completed; final push pending |
| 2. Public evaluation excerpts | Pro branch: 50–100 real excerpts, provenance/license; implementation audits split and source IDs | Completed: final Pro source corpus integrated and audited |
| 3. Synthetic train conversations | Pro branch: training sources only, independent labels | Completed: 36 Japanese training-only cases integrated |
| 4. Judge / tuning / measurement | Runtime agent: versioned prompts/policy; harness agent: metrics/search; coordinator: cached live calls, frozen selection and one final test | Completed; final push pending |
| 5. 30+ criteria per parameter | Pro branch; runtime implements rubric candidates when available | Completed: 96 criteria integrated |

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

### 01:00 JST — partner integration and full development scoring

- Merged Pro data commit `a77ca9c`: 100 sourced English recorded role-play windows, 36 Japanese synthetic Train cases, 96 rubric criteria, original label packets and source licenses.
- Canonical import validates same-series grouping and synthetic training parent linkage. Final data: Train96 / Validation20 / Test20; 20 series. Labels are independent GPT silver; no independent WAIT/SILENCE annotations supplied. Primary selection is therefore semantic outcome Macro-F1, not existing action accuracy.
- Validation support: OK18 / stalled2 / drift0. This cannot demonstrate drift recall; majority-only accuracy is already90%. All headline reporting must retain this limitation. No final test scores accessed.
- Real development pilot10: errors0, latency median302ms/p95941ms, input9104tokens, published input-price estimate$0.00036416 (invoice unknown).
- Development scoring v1/v2/v3 underway with success-only cache. Global $2 envelope enforced, including failed sandbox attempts. Reservation refined for future calls to UTF-8 bytes × 3 × $0.04/M + $0.00064 overhead; prior fixed reservations retained.
- Full regression81 tests passed; typecheck passed; lint0 errors (one pre-existing unused-variable warning). Turbopack build panics at prohibited port binding even after escalation; Webpack fallback running. Retain anonymized Next.js feedback candidate for reporting pass.

### Selection freeze — before any final-test inference

- Integrated audited Pro checkpoint `c7f5b69`; final canonical dataset SHA256 `db57f545163e27633dc86920a8f7ca89d58e79835b17532a3c41f1494b9bfa44`.
- Independent source audit rerun with fixed AMI-ME and manual ZIP succeeded. Final source labels preserve uncertain/disagreement flags.
- 648 validation configurations compared; selected experimental policy: v2, drift0.8/stall0.7/relevance0.6/wait0.4. Validation semantic agreement12/20(60%) →18/20(90%), Macro-F1 0.250→0.536. Always-OK also90%; drift support0.
- To honor unchanged UI with fixed60/40 markers, a separate prompt-only policy was selected on validation BEFORE test: v3 with all original thresholds. Validation15/20(75%), Macro-F10.470.
- Runtime JSON set to this prompt-only candidate and default model pinned to measured `typesafe-ai/jev-1.14.0` BEFORE test. Existing `JEV_MODEL_ID` override remains; benchmark only validates the pinned model. No test-informed deployment selection will be made.
- Full grid policy stays experimental and is not silently adopted behind unchanged threshold display. Final test will report baseline, experimental policy and preselected UI-compatible runtime candidate separately.

### Final evaluation and verification complete

- Frozen Test20 measured once: baseline13/20(65%); experimental threshold winner17/20(85%); preselected runtime prompt-only candidate14/20(70%). No policy reselection after test.
- Test OK19/STALLED1/DRIFT0; always-OK95%. Unique stalled positive misclassified as drift by all three. Do NOT claim convincing intervention80% attainment; sparse positives and provisional labels remain the primary limitation.
- Original UI threshold markers retained; application adopts v3 with0.6/0.6/0.6/0.4 thresholds. Grid winner remains experimental.
- All418 successful unique requests cached;440attempts include20DNS failures and2timeouts. Input408640/output25080tokens; published input-price estimate$0.0163456, actual invoice unknown; conservative reserved envelope$1.956680/2.
- Final report, every grid candidate in JSON/Markdown, source data, criteria, reproduction and honest README evidence prepared.
- Full81 regression tests/typecheck passed again after final policy; lint0 errors/1 existing warning; Webpack production build passed. Independent final code review underway.
- Next: complete final review, commit and push all verified results to implementation branch, verify remote SHA. Staging will not be merged.

### Final reporting preparation

- Final source data audit passed; full integration tests now additionally cover a failed final request resuming under the identical selection, without re-calling successful scores. Four offline CLI tests pass.
- README explicitly separates experimental85% from deployed70%, majority95%, silver labels and missing drift support. Runtime applied only the candidate fixed before Test.
- Next.js reporting pass retained one anonymized build-panic candidate. Protocol confirmed: prepare a review-only form, never submit it; final URL will be supplied.

### Verification ready for final commit

- Latest full suite:82/82 passed, including offline final-error recovery and offline report regeneration.
- Final typecheck passed; lint0errors with1 pre-existing warning; diff whitespace check passed.
- Runtime/UI components unchanged except backend question version and pinned model. Final-test artifacts remain immutable; only reports were rendered offline.
- Remaining operation: commit verified results and push implementation branch; remote SHA verification follows.
