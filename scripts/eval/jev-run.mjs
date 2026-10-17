import assert from 'node:assert/strict';
import { JevError, jevJudge } from '../../lib/judge/jev.ts';
import { cases, holdout } from './jev-cases.mjs';

const live = process.argv.includes('--live');
const useHoldout = process.argv.includes('--holdout');
const caseArg = process.argv.slice(2).find(arg => arg.startsWith('--case='));
const fromArg = process.argv.slice(2).find(arg => arg.startsWith('--from='));
if (process.argv.slice(2).some(arg => !['--live', '--holdout'].includes(arg) && !arg.startsWith('--case=') && !arg.startsWith('--from='))) {
  throw new Error('Usage: node scripts/eval/jev-run.mjs [--live] [--holdout] [--case=id | --from=id]');
}
if (useHoldout && !live) throw new Error('--holdout requires --live');
if (caseArg && fromArg) throw new Error('--case and --from cannot be combined');

const source = useHoldout ? holdout : cases;
const index = fromArg ? source.findIndex(item => item.id === fromArg.slice(7)) : 0;
if (index < 0) throw new Error('Unknown --from id');
const selected = caseArg ? source.filter(item => item.id === caseArg.slice(7)) : source.slice(index);
if (!selected.length) throw new Error('Unknown --case id');
assert.equal(cases.length, 10);
assert.equal(holdout.length, 2);
assert.equal(new Set([...cases, ...holdout].map(item => item.id)).size, 12);
for (const item of [...cases, ...holdout]) {
  assert.ok(item.agenda.length > 0 && item.agenda.length <= 500, item.id);
  assert.ok(item.transcript.length >= 3 && item.transcript.length <= 30, item.id);
  assert.ok(item.transcript.every(line => line.length > 0 && line.length <= 1000), item.id);
  assert.ok(Buffer.byteLength(JSON.stringify(item.transcript)) <= 8000, item.id);
  assert.ok(['intervene', 'no_intervention', null].includes(item.expected), item.id);
}

const guardInput = { agenda: cases[0].agenda, transcript: cases[0].transcript };
assert.equal((await jevJudge({ ...guardInput, secondsSinceLastIntervention: 10 })).action, 'SILENCE');
assert.equal((await jevJudge({ ...guardInput, transcript: guardInput.transcript.slice(0, 2), secondsSinceLastIntervention: 60 })).action, 'WAIT');

if (!live) {
  process.stdout.write(`Offline contract OK: primary=${cases.length}, holdout=${holdout.length}; cooldown and short-history guards OK.\n`);
} else {
  if (process.env.ALLOW_PAID_AI !== 'true' || !process.env.AI_GATEWAY_API_KEY) {
    throw new Error('Live evaluation requires ALLOW_PAID_AI=true and AI_GATEWAY_API_KEY.');
  }
  process.env.JEV_MODEL_ID = 'typesafe-ai/jev';
  let falseInterventions = 0;
  let misses = 0;
  let positives = 0;
  let negatives = 0;
  for (const item of selected) {
    let result;
    try {
      result = await jevJudge({ agenda: item.agenda, transcript: item.transcript, secondsSinceLastIntervention: 60 });
    } catch (error) {
      const providerStatus = error instanceof JevError ? /^Jev returned HTTP (\d{3})$/.exec(error.message)?.[1] : undefined;
      const stage = providerStatus ? 'http' : error instanceof JevError && error.kind === 'timeout' ? 'timeout' : 'transport_or_response';
      process.stderr.write(`Stopped at ${item.id}: ${error?.name ?? 'UnknownError'} / ${error?.kind ?? 'unknown'} / stage=${stage}${providerStatus ? ` / providerStatus=${providerStatus}` : ''}\n`);
      process.exitCode = 1;
      break;
    }
    if (item.expected === 'intervene') {
      positives++;
      if (result.action !== 'INTERVENE') misses++;
    } else if (item.expected === 'no_intervention') {
      negatives++;
      if (result.action === 'INTERVENE') falseInterventions++;
    }
    const d = result.diagnostic;
    process.stdout.write(`${item.id} ${item.category} expected=${item.expected ?? 'review'} actual=${result.action} ` +
      `scores=${d?.drifted?.toFixed(2)}/${d?.stalled?.toFixed(2)}/${d?.tangentIsRelevant?.toFixed(2)}/${d?.interveneNow?.toFixed(2)} latencyMs=${d?.latencyMs}\n`);
  }
  process.stdout.write(`Summary: negatives=${negatives} falseInterventions=${falseInterventions} positives=${positives} misses=${misses}\n`);
  const expectedNegatives = selected.filter(item => item.expected === 'no_intervention').length;
  const expectedPositives = selected.filter(item => item.expected === 'intervene').length;
  if (negatives !== expectedNegatives || positives !== expectedPositives || falseInterventions !== 0 || misses !== 0) process.exitCode = 1;
}
