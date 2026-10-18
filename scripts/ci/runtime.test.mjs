import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkRuntime } from './check-runtime.mjs';

test('Node runtime declarations and local version managers agree on Node 24', () => {
  assert.equal(
    readFileSync(new URL('../../.node-version', import.meta.url), 'utf8').trim(),
    readFileSync(new URL('../../.nvmrc', import.meta.url), 'utf8').trim(),
  );
  assert.doesNotThrow(() => checkRuntime('24.0.0'));
  assert.doesNotThrow(() => checkRuntime('24.22.0'));
});

test('runtime preflight rejects unsupported Node major versions', () => {
  for (const version of ['20.17.0', '22.23.1', '25.0.0', 'invalid']) {
    assert.throws(() => checkRuntime(version), /Node.js 24\.x is required/);
  }
});
