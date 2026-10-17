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
