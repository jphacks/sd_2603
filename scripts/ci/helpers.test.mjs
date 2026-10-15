import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { previewHost } from './preview-host.mjs';

const prepare = fileURLToPath(new URL('./prepare-vercel-env.mjs', import.meta.url));
const report = fileURLToPath(new URL('./report-deployment.mjs', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'meeting-ci-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('pulled paid-AI settings are overridden without exposing unrelated secrets', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.vercel'));
  const file = join(dir, '.vercel/.env.preview.local');
  writeFileSync(file, 'AI_PROVIDER="jev"\nALLOW_PAID_AI="true"\nexport AI_PROVIDER=jev\nOTHER="fixture-secret"\n');
  const stdout = execFileSync(process.execPath, [prepare, 'preview'], { cwd: dir, encoding: 'utf8' });
  const contents = readFileSync(file, 'utf8');
  assert.equal((contents.match(/^AI_PROVIDER=/gm) ?? []).length, 1);
  assert.equal((contents.match(/^ALLOW_PAID_AI=/gm) ?? []).length, 1);
  assert.match(contents, /^AI_PROVIDER="mock"$/m);
  assert.match(contents, /^ALLOW_PAID_AI="false"$/m);
  assert.match(contents, /OTHER="fixture-secret"/);
  assert.doesNotMatch(stdout, /fixture-secret/);
});

test('unknown deployment targets are rejected', t => {
  const dir = fixture(t);
  const result = spawnSync(process.execPath, [prepare, '../../other'], { cwd: dir });
  assert.notEqual(result.status, 0);
});

test('deployment URLs are reported for nested and flat CLI responses', t => {
  const dir = fixture(t);
  const file = join(dir, 'deployment.json');
  const summary = join(dir, 'summary.md');
  for (const result of [
    { deployment: { url: 'https://demo-preview.vercel.app', productionUrl: 'https://demo.vercel.app' } },
    { url: 'demo-preview.vercel.app' },
  ]) {
    writeFileSync(file, JSON.stringify(result));
    execFileSync(process.execPath, [report, file], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: join(dir, 'outputs') },
    });
  }
  assert.match(readFileSync(summary, 'utf8'), /https:\/\/demo-preview\.vercel\.app/);
  assert.match(readFileSync(summary, 'utf8'), /https:\/\/demo\.vercel\.app/);
  assert.match(readFileSync(join(dir, 'outputs'), 'utf8'), /^deployment_url=https:\/\/demo-preview\.vercel\.app\/$/m);
  assert.doesNotMatch(readFileSync(join(dir, 'outputs'), 'utf8'), /deployment_url=https:\/\/demo\.vercel\.app/);
});

test('missing or unexpected deployment URLs fail instead of reporting success', t => {
  const dir = fixture(t);
  const file = join(dir, 'deployment.json');
  for (const result of [{}, { url: 'http://demo.vercel.app' }, { url: 'https://demo.vercel.app.example.com' }]) {
    writeFileSync(file, JSON.stringify(result));
    const run = spawnSync(process.execPath, [report, file]);
    assert.notEqual(run.status, 0);
  }
});

test('branch URLs are stable, distinct and valid DNS labels', () => {
  const branches = ['staging', 'feature/focus-ui', 'feature/a/b', 'feature/a-b', 'feature/A-B', `feature/${'very-long-name-'.repeat(20)}`, 'feature/日本語'];
  const hosts = branches.map(branch => previewHost('jphacks/sd_2603', branch));
  assert.equal(new Set(hosts).size, hosts.length);
  for (const [i, host] of hosts.entries()) {
    assert.equal(host, previewHost('jphacks/sd_2603', branches[i]));
    const label = host.split('.')[0];
    assert.ok(label.length <= 63);
    assert.match(label, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
  }
  assert.notEqual(previewHost('other/repository', 'feature/focus-ui'), hosts[1]);
});

test('Production and PR refs cannot get a branch Preview alias', () => {
  for (const branch of ['main', 'refs/pull/1/merge', 'bugfix/example', '']) {
    assert.throws(() => previewHost('jphacks/sd_2603', branch));
  }
  assert.throws(() => previewHost('', 'staging'));
});
