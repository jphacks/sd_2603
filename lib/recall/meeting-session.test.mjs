import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeetingSession, readMeetingSession } from './meeting-session.ts';

test('browser session owners are random, signed and expire; modifying owner or signature is rejected', () => {
  const key = 'server-side-test-secret';
  const now = 1792290000000;
  const a = createMeetingSession(key, now);
  const b = createMeetingSession(key, now);
  assert.notEqual(a.owner, b.owner);
  assert.equal(readMeetingSession(a.value, key, now), a.owner);
  assert.equal(readMeetingSession(a.value.replace(a.owner, b.owner), key, now), null);
  assert.equal(readMeetingSession(a.value, 'different-secret', now), null);
  assert.equal(readMeetingSession(a.value, key, now + 31 * 86400000), null);
  for (const invalid of [undefined, '', a.value + '.extra', '../x', 'x'.repeat(201)]) assert.equal(readMeetingSession(invalid, key, now), null);
});
