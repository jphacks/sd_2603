# Integration contract for Pro data branch

Implementation branch: `codex/jev-tuning-implementation`. Data branch: `codex/jev-tuning-data`.

Recommended file: `evals/tuning/data/cases.json`, array of cases:

```json
{
  "id": "unique-case-id",
  "agenda": "explicit agenda or documented inferred agenda",
  "transcript": ["A: ...", "B: ...", "A: ..."],
  "secondsSinceLastIntervention": 120,
  "sourceGroup": "ES2002",
  "split": "train",
  "gold": {
    "status": "OK",
    "action": "SILENCE",
    "reason": "independent annotation rationale"
  },
  "dataKind": "real-roleplay",
  "provenance": {
    "corpus": "AMI manual 1.6.2",
    "license": "CC-BY-4.0",
    "source": "https://groups.inf.ed.ac.uk/ami/download/",
    "meeting": "ES2002a",
    "seriesId": "ES2002",
    "wordRanges": ["source XML ranges"]
  }
}
```

- `gold.status`: `INTERVENE_DRIFT`, `INTERVENE_STALLED`, `OK` (semantic outcomes only; no UI renaming).
- `gold.action`: `SILENCE`, `WAIT`, `INTERVENE` independently annotated. Omit if unavailable; never invent WAIT vs SILENCE from semantic OK. Exact-action model selection only if all validation cases have action labels.
- Preserve annotation model/session or rubric version, disagreement, confidence and humanReviewed=false. No Jev predictions given to annotators.
- `split`: `train`, `validation`, `test`. All a/b/c/d meetings and synthetic derivatives of one series stay together.
- Synthetic cases: `dataKind=synthetic`, `parentId`, same sourceGroup as training parent, train only. Parent must be in integrated dataset.
- `expectedAction`, `gold_status`, `groupId`, `source.seriesId` and `source.meetingId` variants can be adapted; validate before measurement.
- Prompts and thresholds chosen from development only. Final test scored after frozen selection, never used in synthetic generation.
- Legacy 20-case regression set is synthetic, previously inspected, and not a new heldout test.
