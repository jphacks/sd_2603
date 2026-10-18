# Jev tuning — data and independent evaluation

- Status: in progress (2026-10-18 JST)
- Branch: `codex/jev-tuning-data`
- Base: fetched `origin/staging`, `e1d94f0fe4e0d5fac05681bfad30c086946336e9`
- Scope: public real conversation excerpts (50–100), provenance/license, 30+ criteria per score, group split, Japanese synthetic training conversations, independent labels, audits and reproduction.
- Constraints: no Gateway calls; no application changes; no staging merge or final integration; no measured accuracy claimed without Jev evaluation.

## Completed

- Inspected current checkout; pre-existing implementation edits belong to another session and were left in place.
- Created independent managed worktree and dedicated branch from refreshed staging.
- Located official AMI manual annotations v1.6.2; official download page states CC BY 4.0.

## Current / next

1. Verify source license and download manual transcripts.
2. Extract 50–100 timestamped windows and split by complete meeting series before generation.
3. Write scoring rubric and independently annotate excerpts without Jev predictions.
4. Generate Japanese conversations exclusively from Train and independently re-label them.
5. Audit provenance, labels, leakage, and reproducibility; commit and push incremental outputs.

## Issues / limitations

- Sandbox launcher is unavailable; shell commands require reviewed escalation.
- No Jev prediction or accuracy has been measured in this data-only branch.
- AMI scenario meetings are recorded human role-play, not spontaneous business meetings; preserve this distinction.

## Resumption / data preparation

- Human explicitly approved scoped file writes, commit and push after auto-review rejected a child label write based on the earlier sharing-only instruction. Resumed scoped data work; no application edits.
- Prepared 100 recorded human role-play excerpts (AMI / AMI-ME), 20 series split Train 60 / Validation 20 / Test 20.
- Initial systematic sample yielded only OK at segment endpoints. Replaced 10 rows, preserving split and Train generation seeds, with source-screened diagnostic windows. Original sampling packets/labels remain for audit, not final evaluation.
- Three scoring axes each have 32 criteria and counterexamples (96 total), with literature background explicitly distinguished from proposed operational rules.
- Authored 36 Japanese synthetic Train dialogues from 12 Train seeds; generation intent hidden from independent labelers.
- Independent primary labels saved for synthetic and challenge packets; original Train labels are being restored after approval. Second blind review is underway.
- Source lexical check on final excerpts: 1,932 lexical utterances, four punctuation-only utterances, zero missing-token cases within rounded timestamp tolerance. This is not an exact word alignment or proof that metadata gaps are silence.
- Next: consolidate active labels, independent re-review/disagreement flags, source attribution and deterministic reproduction, leakage/schema audit, staged commit/push.

## Scoped completion audit

- Human explicitly approved saving, commit and push. Data work resumed.
- Prepared 100 recorded English role-play excerpts, 20 series / 98 distinct segments, Train60/Validation20/Test20. Sources, inclusive ranges and CC BY 4.0 credits saved.
- Completed 96 rubric criteria (32 per score), each with a counterexample.
- Authored 36 Japanese synthetic Train dialogues from 12 Train source cases. Generation intent and independent labels separated.
- Primary labels cover all136 active cases; 20 real and 1 synthetic are uncertain. All uncertain examples re-reviewed.
- Re-review covers57 distinct cases. Four status disagreements retained and flagged. One reviewer previously saw a longer future window; that short-window review was replaced by a reviewer without that exposure. Protocol and original records retained.
- Exact source JSON range matches100/100. Official AMI lexical membership checks1932 utterances with zero mismatches; four punctuation-only utterances excluded as lexical evidence. This is not exact word-order alignment.
- Zero series crossings, exact-text cross-split duplicates or synthetic heldout ancestors. Two within-split overlap pairs disclosed. Speaker identity across series not audited.
- Source order retained; timestamp inversions and a368-second metadata gap are disclosed. No silence inferred.
- Real provisional labels: OK95/STALLED4/DRIFT1. Majority baseline95%; Validation/Test have no DRIFT labels. This dataset alone cannot establish persuasive three-class80% performance. No Jev inference or accuracy measured.
- Temporary-copy reproduction passed byte-identical comparison. Negative checks reject a Test synthetic ancestor and changed source bytes.
- Integration entry: README.md, data/final/, rubric.md, experiments.md, audit-report.json. Only docs/jev-tuning is changed. No application edits, Gateway calls, staging merge or final integration.
- Checkpoints f829de1 and a77ca9c pushed to origin/codex/jev-tuning-data. Final audited checkpoint SHA will be reported in chat.
- External follow-up: integration owner runs Jev and selects prompts/thresholds using Train/Validation. Additional Japanese real intervention cases and selective human adjudication are needed for a convincing three-class evaluation.
- Next.js feedback pass: no qualifying Next.js issue encountered in this data-only task; feedback command not needed.

## Positive expansion — new request

- Investigate at least100 evidence items including actual conversation cases (counting clarified by human); prepare at least100 positive Validation/Test scripts.
- Reuse data worktree/branch; preserve integration checkout and its uncommitted changes.
- Read integration branch local HEAD3167b9b and fetched remote213de90, actual v1/v2/v3 questions, priority/gates/input schema; snapshot hashes and definition contract saved under positive-expansion/.
- Common semantics: sustained unhelpful off-agenda talk; repeated unproductive blockage. Latest-state judgment, no inferred silence, permitted breaks excluded, stalled priority. v1/v2 usefulness-axis difference recorded; new positives avoid that boundary.
- Research in parallel: direct topical-departure literature, impasse/process-loss literature, and licensable recorded dialogue cases. No Gateway calls or application edits.

### Positive expansion checkpoint

- Literature records: drift13 / stalled17 (overlapping papers to be deduplicated in unified registry; not30 independent papers by fiat).
- Research actual cases:125 unique DBDC3 Japanese human-chatbot conversations, target X votes>=20/30, MIT main data. Source archive/member SHA and pre-target excerpt ranges retained. These are real dialogue-breakdown observations, not meeting drift/stall gold.
- Extra source candidates:2 CaSiNo resource-negotiation excerpts; no-deal is not auto-labeled stalled.
- New authored meetings:112 Japanese scripts in28 mechanism families, all four variants per family in one split. Intended56 drift/56 stall; Validation56/Test56. Intent hidden from two primary blind labelers; independent labels underway.
- Primary definitions aligned with integration local3167b9b, remote213de90. Schema gap recorded: current importer forbids synthetic holdouts. Do not fake dataKind to bypass it; integration needs explicit authored-holdout contract.

- Blind review of112 v1 scripts found all intended positive, but exposed major diversity weakness: only agenda changed within many families. Do not count this as112 independent meeting phenomena. v2 is being individually rewritten by two authors; a third evaluator has not seen author intent and will label all revised scripts. Preserve v1 only as design history.

### Positive v2 quality revision

- Replaced all112 draft dialogues with individually authored concrete exchanges (two authors56 each). Full transcripts and nonopening bodies are unique; every v1 body was changed. Same28 family groups/splits and literature references retained.
- Frozen blind-v2 input handed to a third agent, who has not read author intent, former labels or Jev predictions. Primary gold will come from that full112 review, not from generation intent.
- ① counted registry will contain28 distinct publication/dataset URLs (2 duplicate aliases removed),125 unique human-chatbot breakdown observations, and2 separate negotiation candidates. Adjacency to meeting obstruction is explicit; no claim of125 human-meeting positive golds.

- Integration recheck: HEAD advanced to7f66361; actual diff only pins Jev model1.14.0 and selects questionVersionv3, plus importer switches to final labels. Definitions/priority/thresholds unchanged; synthetic-holdout guard unchanged. No model predictions read, no gold redesigned in response.

### Positive expansion completion audit

- ① Unified ledger155:28 distinct publication/dataset URLs after2 aliases removed +125 unique annotated human-chatbot breakdown cases +2 distinct human negotiation candidates. All125 case-specific content analyses completed. These are not155 papers or125 meeting intervention golds.
- ② Individually authored v2 meeting scripts112; independent evaluator read all112 without intent, old labels or predictions:56 drift /56 stalled. One boundary case flagged, leaving111 clear silver positives for primary evaluation (Validation55:28drift/27stall; Test56:28drift/28stall).
- 28 generator families stay in one split; no Train additions. Full/nonopening body duplicates0, body5gram Jaccard>=.65 pairs0, previous datasets' normalized exact matches0. Shared definitions/vocabulary are not claimed unseen.
- All112 label input hashes and evidence bounds match. Source DBDC125 original text/ranges/votes/member hashes reverified. Reproduction passed byte-identical comparison of17 final package outputs.
- Negative checks reject altered post-label text and changed family split in a temporary copy.
- Node24 integration offline semantic schema passed111; provenance guard intentionally rejects synthetic outside Train. No guard bypass, no application edits. Schema/contract report saved. Integration owner needs an explicit authored-evaluation contract; this is outside the data-only work.
- Definitions refreshed against integration HEAD7f66361/v3; priority and thresholds unchanged. No Jev predictions or score cache read and no Gateway/model API calls made.
- Entry: positive-expansion/README.md, research-index.md, data/primary-positive-validation.json, data/primary-positive-test.json, data/positive-*.md, positive-audit.json, integration-handoff.md.
- No measured accuracy or80% achievement claimed. Positive-only silver sets diagnose recall and missed intervention, not real-world three-class accuracy.
- Next.js feedback pass: no qualifying Next.js behavior issue encountered in this data-only extension.

- Supplemental CaSiNo2 candidates also checked against the fixed1030-dialogue JSON: source SHA, dialogue ID, 1-based range, speaker and text all match.

## Synthetic benchmark v1 — new task (2026-10-18 09:48 JST start)

- New directory: `synthetic-benchmark-v1/`; previous datasets preserved. Existing8997c70/96102b3 reused, no research restart.
- Specification/split checkpoint21c6e7e, research-map checkpoint4cf3744 pushed before bulk conversation writing.
- Target500 (design D150/S150/borderlineOK150/clearOK50), 100 new scenario families, Train300/Validation100/Test100, stable Train group folds0–4. Extension to1000 only if quality and time permit; frozen500 splits must not move.
- AuthorA=rubric, AuthorB=train_labels, AuthorC=corpus_research. Each first writes50 Train cases, then judges another author's blind packet. No judge sees their own authored cases or other-author intention.
- Generated0 / labeled0 / audited0 at specification freeze. Expected500 by11:00 if first batches maintain pace;1000 is conditional, not promised. Next10:30 checkpoint.
- No Gateway, paid model API, Jev predictions, application/runner/policy changes, staging merge. Synthetic Test remains explicitly synthetic for integration owner to support.
