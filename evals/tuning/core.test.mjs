import test from 'node:test';
import assert from 'node:assert/strict';
import { baseline, classify, action, metrics, evaluate, select, validateCases } from './core.mjs';
const score = (drifted = .1, stalled = .1, tangentIsRelevant = .1) => ({ drifted, stalled, tangentIsRelevant });
const makeCase = (id, split = 'validation', status = 'OK', extra = {}) => ({ id, split, agenda: 'Decide release', sourceGroup: id, transcript: [`${id}: one`, 'two', 'three'], gold: { status }, ...extra });
test('baseline preserves stalled priority and action boundaries', () => {
  assert.equal(classify(score(.9, .6)), 'INTERVENE_STALLED');
  assert.equal(classify(score(.6, .1, .6)), 'OK');
  assert.equal(classify(score(.6, .1, .59)), 'INTERVENE_DRIFT');
  assert.equal(action(score(.4)), 'WAIT');
  assert.equal(action(score(.39)), 'SILENCE');
  assert.equal(classify(score(NaN)), null);
  assert.equal(classify(score(1.1)), null);
});
test('errors remain in denominator, absent classes score zero, false interventions exclude errors', () => {
  const m = metrics([{gold:'OK',actual:'OK'}, {gold:'OK',actual:null}, {gold:'OK',actual:'INTERVENE_DRIFT'}, {gold:'INTERVENE_DRIFT',actual:'INTERVENE_DRIFT'}]);
  assert.equal(m.accuracy, .5);
  assert.equal(m.errors, 1);
  assert.equal(m.perClass.OK.recall, 1/3);
  assert.equal(m.perClass.INTERVENE_STALLED.f1, 0);
  assert.equal(m.falseInterventionRate, 1/3);
  assert.equal(m.majorityBaseline, .75);
  assert.ok(m.wilson95[0] < .5 && m.wilson95[1] > .5);
  assert.equal(metrics([]).wilson95, null);
  assert.throws(() => metrics([{gold:'unknown',actual:'OK'}]));
});
test('normalization rejects duplicate transcripts and group leakage', () => {
  const a = makeCase('a');
  assert.equal(validateCases([a]), true);
  assert.throws(() => validateCases([a, {...makeCase('b','test'), transcript: a.transcript.map(t => ` ${t.toUpperCase()} `)}]), /Duplicate transcript/);
  assert.throws(() => validateCases([a, {...makeCase('b','test'), sourceGroup:'a'}]), /leakage/);
  assert.throws(() => validateCases([{...a,gold:{status:'WAIT'}}]));
});
test('selection excludes train/test and prefers unchanged baseline on ties', () => {
  const validation = makeCase('v');
  const cases = [validation, makeCase('t','test','INTERVENE_STALLED'), makeCase('r','train','INTERVENE_DRIFT')];
  const scores = {v1:{v:score(), t:score(),r:score()}};
  const selected = select(cases, scores, ['v1']);
  assert.deepEqual(selected.policy, baseline);
  assert.equal(selected.metrics.n, 1);
  assert.equal(selected.selectionCriterion, 'semantic-status');
  assert.throws(() => select([cases[1]], scores), /validation/);
});
test('exact action is independent of semantic labels and only selected with complete labels', () => {
  const c = makeCase('a', 'validation', 'OK', {gold:{status:'OK',action:'WAIT'}});
  const scores = {a:score(.5,.1,.9)};
  const result = evaluate([c],scores);
  assert.equal(result.exactActionMetrics.accuracy, 1);
  assert.equal(result.actionLabelCoverage, 1);
  assert.equal(select([c],{v1:scores},['v1']).selectionCriterion,'exact-action');
  assert.equal(evaluate([makeCase('b')],{}).exactActionMetrics, null);
});
test('runtime gates override aggressive scores consistently for both metrics', () => {
  const cooldown = makeCase('cooldown', 'validation', 'OK', {secondsSinceLastIntervention:59, gold:{status:'OK',action:'SILENCE'}});
  const short = makeCase('short', 'validation', 'OK', {transcript:['one'], gold:{status:'OK',action:'WAIT'}});
  const both = makeCase('both', 'validation', 'OK', {transcript:['two'],secondsSinceLastIntervention:0,gold:{status:'OK',action:'SILENCE'}});
  assert.equal(validateCases([cooldown,short,both]),true);
  const scores = Object.fromEntries([cooldown,short,both].map(c => [c.id, score(.99,.99,0)]));
  const result = evaluate([cooldown,short,both],scores);
  assert.equal(result.accuracy,1);
  assert.equal(result.exactActionMetrics.accuracy,1);
  assert.equal(evaluate([cooldown,short,both],{}).errors,0);
  const boundary = {...cooldown,secondsSinceLastIntervention:60,gold:{status:'INTERVENE_STALLED',action:'INTERVENE'}};
  assert.equal(evaluate([boundary],scores).exactActionMetrics.accuracy,1);
  const absent = {...boundary};
  delete absent.secondsSinceLastIntervention;
  assert.equal(evaluate([absent],scores).accuracy,1);
});
