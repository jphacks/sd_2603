import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replayCases, runReplaySuite } from './meeting-replay.mjs';

test('offline PCM replay exercises six meeting policies through the real worker', { timeout: 40000 }, async () => {
  const report = await runReplaySuite();
  assert.equal(report.measuresModelAccuracy, false);
  assert.equal(report.cases.length, 6);
  assert.deepEqual(report.cases.map(result => result.id), replayCases.map(scenario => scenario.id));
  assert.equal(report.passed, true, JSON.stringify(report, null, 2));
  for (const result of report.cases) {
    assert.equal(result.falseInterventions, 0);
    assert.equal(result.missedInterventions, 0);
    assert.equal(result.speakingViolations, 0);
  }
});
