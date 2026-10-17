import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSameOrigin, requestOrigin } from './origin.ts';

function request(host, origin, other = {}) {
  return new Request('http://localhost:3000/api/focus/sessions', { headers: { host, ...(origin ? { origin } : {}), ...other } });
}
test('browser Host is used when Next normalizes the internal URL to localhost', () => {
  assert.equal(hasSameOrigin(request('127.0.0.1:3000', 'http://127.0.0.1:3000')), true);
  assert.equal(hasSameOrigin(request('localhost:3000', 'http://localhost:3000')), true);
  assert.equal(hasSameOrigin(request('[::1]:3000', 'http://[::1]:3000')), true);
});
test('cross-origin, wrong port, null origin and forged forwarding headers remain blocked', () => {
  for (const origin of ['https://attacker.example', 'http://127.0.0.1:3001', 'null', 'http://localhost:3000']) {
    assert.equal(hasSameOrigin(request('127.0.0.1:3000', origin)), false);
  }
  assert.equal(hasSameOrigin(request('127.0.0.1:3000', 'https://attacker.example', { 'x-forwarded-host': 'attacker.example' })), false);
});
test('public Host remains public even if the internal bind hostname is localhost', () => {
  assert.equal(requestOrigin(request('app.example', 'http://app.example')).hostname, 'app.example');
  assert.equal(hasSameOrigin(request('app.example', 'http://app.example')), true);
  assert.equal(hasSameOrigin(request('app.example/path', 'http://app.example')), false);
  assert.equal(hasSameOrigin(request('127.0.0.1:3000')), true);
});
