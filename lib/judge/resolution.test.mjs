import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvesIntervention } from './resolution.ts';

const judged = (drifted, stalled, tangentIsRelevant) => ({ action: 'SILENCE', reason: 'x', message: null,
  diagnostic: { drifted, stalled, tangentIsRelevant, interveneNow: 0.5, model: 'test', latencyMs: 1, questionVersion: 'v2' } });

test('only a judgement back on track resolves a held card', () => {
  assert.equal(resolvesIntervention(judged(0.1, 0.1, 0.1)), true, 'on the agenda and moving');
  assert.equal(resolvesIntervention(judged(0.9, 0.1, 0.8)), true, 'a useful tangent');
  assert.equal(resolvesIntervention(judged(0.5, 0.1, 0.1)), false, 'still uncertain about the drift');
  assert.equal(resolvesIntervention(judged(0.1, 0.5, 0.1)), false, 'still stalling');
  assert.equal(resolvesIntervention({ action: 'SILENCE', reason: 'Cooldown active', message: null }), false, 'no scores, no resolution');
  assert.equal(resolvesIntervention({ action: 'WAIT', reason: 'Tangent marked useful', message: null }), true, 'a participant marked the tangent useful');
});
