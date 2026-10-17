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
