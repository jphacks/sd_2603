import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('./run.mjs', import.meta.url));
const json = path => JSON.parse(readFileSync(path, 'utf8'));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-runner-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = join(dir, 'cases.json'), out = join(dir, 'out'), requests = join(dir, 'requests.jsonl');
  const cache = join(dir, 'cache.json'), ledger = join(dir, 'ledger.json'), failure=join(dir,'fail-once');
  const cases = Array.from({ length: 13 }, (_, i) => {
    const kind = ['OK', 'INTERVENE_DRIFT', 'INTERVENE_STALLED'][i % 3];
    return { id: `case-${i}`, agenda: `Choose release ${i}`, transcript: [`case ${i} ${kind}`, `Unique evidence ${i}`, `Next step ${i}`], sourceGroup: `meeting-${i}`, secondsSinceLastIntervention: 120,
      split: i < 8 ? 'train' : i < 11 ? 'validation' : 'test', gold: { status: kind, action: kind === 'OK' ? 'SILENCE' : 'INTERVENE' } };
  });
  writeFileSync(data, JSON.stringify(cases));
  const preload = join(dir, 'mock.mjs');
  writeFileSync(preload, `import {appendFileSync,existsSync,unlinkSync} from 'node:fs';
    globalThis.fetch = async (url, options) => {
      const body=JSON.parse(options.body);
      appendFileSync(process.env.MOCK_REQUESTS,JSON.stringify(body)+'\\n');
      const text=body.state.conversation.join(' ');
      if(text.startsWith('case 11 ')&&existsSync(process.env.MOCK_FAILURE)){unlinkSync(process.env.MOCK_FAILURE);return new Response('{}',{status:503});}
      const scores={drifted:text.includes('INTERVENE_DRIFT')?.9:.1, stalled:text.includes('INTERVENE_STALLED')?.9:.1,tangentIsRelevant:.1};
      return new Response(JSON.stringify({model:body.model,usage:{input_tokens:42},answers:Object.fromEntries(Object.entries(scores).map(([k,noul])=>[k,{type:'noul',noul}]))}),{status:200});
    };`);
  function run(command, extra = [], succeeds = true) {
    const result = spawnSync(process.execPath, ['--import', preload, cli, command, `--data=${data}`, `--out=${out}`, `--cache=${cache}`, `--ledger=${ledger}`, ...extra],
      { env: { ...process.env, AI_GATEWAY_API_KEY: 'offline-test-only', MOCK_REQUESTS: requests, MOCK_FAILURE:failure }, encoding: 'utf8', timeout: 60000 });
    assert.ifError(result.error);
    if (succeeds) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0, result.stdout);
    return result;
  }
  const calls = () => existsSync(requests) ? readFileSync(requests, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  return {dir,data,out,cache,ledger,failure,cases,run,calls};
}

test('offline pilot, cached development, frozen selection and final holdout lifecycle', t => {
  const f=fixture(t);
  f.run('pilot');
  assert.equal(f.calls().length,10);
  assert.equal(json(join(f.out,'pilot.json')).errors,0);
  assert.ok(f.calls().every(r=>!r.state.conversation[0].startsWith('case 11 ')&&!r.state.conversation[0].startsWith('case 12 ')));
  f.run('pilot');
  assert.equal(f.calls().length,10,'pilot reuses successful cached scores');
  assert.equal(json(join(f.out,'pilot.json')).cached,10);
  f.run('score');
  assert.equal(f.calls().length,33,'11 development cases times three prompts');
  f.run('score');
  assert.equal(f.calls().length,33);
  f.run('tune');
  const selection=json(join(f.out,'selection.json'));
  assert.equal(selection.selected.metrics.n,3,'selection evaluates validation only');
  assert.equal(selection.testUsed,false);
  assert.equal(selection.selected.selectionCriterion,'exact-action');
  assert.equal(f.calls().length,33,'threshold search performs no network calls');
  f.run('final');
  assert.deepEqual(json(join(f.out,'selection.json')),selection,'final cannot modify chosen policy');
  const final=json(join(f.out,'final.json'));
  assert.equal(final.after.semantic.n,2);
  assert.equal(final.after.semantic.accuracy,1);
  const completedCalls=f.calls().length;
  f.run('report');
  assert.equal(f.calls().length,completedCalls,'report is offline');
  assert.ok(completedCalls>=35&&completedCalls<=37);
  assert.match(f.run('final',[],false).stderr,/Final already completed/);
  assert.match(f.run('tune',[],false).stderr,/no reselection/);
  assert.match(f.run('score',[],false).stderr,/locked/);
  assert.equal(f.calls().length,completedCalls);
});

test('manifest changes reject further calls instead of silently mixing experiments', t => {
  const f=fixture(t);
  f.run('pilot');
  f.cases[0].agenda='Changed agenda after scoring';
  writeFileSync(f.data,JSON.stringify(f.cases));
  assert.match(f.run('score',[],false).stderr,/Inputs\/model\/questions changed/);
  assert.equal(f.calls().length,10);
});

test('budget envelopes include attempts and prevent another paid request', t => {
  const f=fixture(t);
  assert.match(f.run('pilot',['--budget-usd=0.0015'],false).stderr,/Budget envelope exhausted/);
  const spent=json(f.ledger);
  assert.ok(spent.attempts>=1&&spent.attempts<10);
  assert.equal(f.calls().length,spent.attempts);
  assert.ok(spent.reservedUsd>0&&spent.reservedUsd<=.0015);
  assert.match(f.run('pilot',[`--max-calls=${spent.attempts}`],false).stderr,/Budget envelope exhausted/);
  assert.equal(f.calls().length,spent.attempts);
  assert.equal(existsSync(join(f.out,'pilot.json')),false,'partial pilot cannot authorize full scoring');
});


test('failed final requests resume under the same frozen selection', t => {
  const f=fixture(t);
  f.run('pilot');f.run('score');f.run('tune');
  const selection=json(join(f.out,'selection.json'));
  writeFileSync(f.failure,'fail one heldout request');
  f.run('final',[],false);
  assert.equal(existsSync(join(f.out,'final.json')),false);
  assert.equal(existsSync(join(f.out,'final-incomplete.json')),true);
  assert.equal(existsSync(join(f.out,'final-lock.json')),true);
  const firstCalls=f.calls().length;
  f.run('final');
  assert.equal(f.calls().length,firstCalls+1,'only the failed score is retried');
  assert.deepEqual(json(join(f.out,'selection.json')),selection);
  assert.equal(json(join(f.out,'final.json')).after.semantic.errors,0);
});
