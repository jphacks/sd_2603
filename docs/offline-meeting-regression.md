# Offline meeting pipeline regression

Run from the repository root with Node.js 24:

```sh
node scripts/regression/meeting-replay.mjs
node --test scripts/regression/meeting-replay.test.mjs
```

The CLI prints one JSON report and exits nonzero on a failing scenario. No environment
file, API key, meeting, browser, or existing recording is needed. Tests use temporary
directories and ephemeral loopback ports; they do not touch an active bot or app.
Loopback HTTP/WebSocket access must be permitted by the execution environment.

## What runs

Each scenario starts the real transcription worker in a separate process, replays a
generated mono PCM16 WAV as Recall mixed-audio WebSocket frames, and traverses the
real resampler, streaming SDK, final-only segmentation, quiet gate, HTTP control
contract, and eight-second automatic idle timer. Scenarios run in parallel and
typically take about 15–20 seconds together. Processes, connections, and temporary
session files are cleaned up after success or failure.

The Gateway WebSocket is replaced by a fixed-transcript transport. All external
HTTP is blocked inside the child. A local mock HTTP video endpoint supplies fixed
judgments and records display/idle requests. It does **not** invoke Jev, real STT,
the Next.js judge/video routes, the image renderer, or Recall's output API. Mock
judgments include two initial WAIT responses to represent accumulating context.

| Scenario | Fixed judgment behavior | Expected camera requests |
| --- | --- | --- |
| On agenda | WAIT | None |
| Useful tangent | SILENCE | None |
| Brief detour then return | INTERVENE then WAIT | None |
| Sustained detour | INTERVENE twice on new finals | One display, one idle |
| Stalled discussion | Stalled INTERVENE | One display, one idle |
| Speech resumes during judgment | Delayed stale INTERVENE, then new final | No interruption; later one display, one idle |

## Reading the report

- `falseInterventions`, `missedInterventions`, and `duplicateInterventions` compare
  camera requests with the scenario's **application-policy** expectation.
- `speakingViolations` checks the quiet interval; the speech-resumption scenario
  separately asserts that the delayed old result cannot display during new speech.
- `quietToDisplayMs` is elapsed wall time from the final synthetic voiced frame to
  the display request. It includes the quiet window and local processing, not real
  provider/network or end-to-end Meet latency.
- `displayToIdleMs` measures the real eight-second worker timer to the idle request.
- `finalizedTurns` counts HTTP evaluations whose final transcript history was
  checked against the fixture. It is not a count of human speaker turns.

PCM is deliberately sent faster than real time; silence segmentation uses frame
duration while intervention/idle timers use real elapsed time. The generated tone
contains no speech. Therefore a green report proves deterministic pipeline policy
regression coverage, **not transcription accuracy, semantic judgment quality,
rendering correctness, or a successful live meeting**. Keep Jev evaluation results
and the final real Meet smoke test as separate evidence.
