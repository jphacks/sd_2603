import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { verifyRecallWebhook } from './verify.ts';
import { chatEventSchema, chatMessage, agendaText } from './chat.ts';

test('webhook verifies raw body, rotation and timestamp; rejects tampering', () => {
  const key = Buffer.alloc(32, 7), raw = '{"event":"test"}', timestamp = '1700000000';
  const signature = createHmac('sha256', key).update(`evt-1.${timestamp}.${raw}`).digest('base64');
  const headers = new Headers({ 'webhook-id': 'evt-1', 'webhook-timestamp': timestamp, 'webhook-signature': `v1,invalid v1,${signature}` });
  const secret = `whsec_${key.toString('base64')}`;
  assert.equal(verifyRecallWebhook(raw, headers, secret, 1700000000000), true);
  assert.equal(verifyRecallWebhook(raw + ' ', headers, secret, 1700000000000), false);
  assert.equal(verifyRecallWebhook(raw, headers, secret, 1700000400000), false);
  assert.equal(verifyRecallWebhook(raw, new Headers(), secret), false);
});
test('official chat payload becomes bounded text and unique HTTPS links', () => {
  const event = chatEventSchema.parse({ event: 'participant_events.chat_message', data: { bot: { id: '12345678-1234-4123-8123-123456789abc' }, data: { participant: { id: 1, name: '参加者' }, timestamp: { absolute: '2026-10-17T00:00:00Z' }, data: { text: '#agenda 議題 https://drive.google.com/file/d/abcdefghijklm/view', to: 'everyone' } } } });
  const message = chatMessage(event, 'evt-1');
  assert.equal(message.sender, '参加者');
  assert.equal(message.links.length, 1);
  assert.match(agendaText(message), /^議題/);
});
