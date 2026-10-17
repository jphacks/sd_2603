import assert from 'node:assert/strict';
import test from 'node:test';
import { agendaCandidate, needsAgendaImport } from './agenda.ts';

const message = (id, text, links = []) => ({ id, text, links });
test('normal conversation is ignored; Drive file links and agenda commands are accepted', () => {
  assert.equal(agendaCandidate({ meetChat: [message('1', 'こんにちは'), message('2', 'https://example.com', ['https://example.com'])] }), null);
  assert.equal(agendaCandidate({ meetChat: [message('3', '#agenda 今日決めること')] }).text, '今日決めること');
  const link = 'https://drive.google.com/file/d/abcdefghijklm/view';
  assert.equal(agendaCandidate({ meetChat: [message('4', link, [link]), message('5', '了解です')] }).link, link);
});
test('latest agenda wins; processed and failed messages are not repeatedly downloaded', () => {
  const session = { closed: false, meetChat: [message('1', '#agenda first'), message('2', '#agenda second')] };
  assert.equal(agendaCandidate(session).messageId, '2');
  assert.equal(needsAgendaImport(session), true);
  for (const state of ['ready', 'error']) {
    assert.equal(needsAgendaImport({ ...session, agendaImport: { messageId: '2', state } }), false);
    assert.equal(needsAgendaImport({ ...session, agendaImport: { messageId: '1', state } }), true);
  }
  assert.equal(needsAgendaImport({ ...session, closed: true }), false);
});
test('an active worker is not duplicated, and interrupted processing can recover', () => {
  const session = { closed: false, meetChat: [message('1', '#agenda text')], agendaImport: { messageId: '1', state: 'processing', startedAt: 1000 } };
  assert.equal(needsAgendaImport(session, 2000), false);
  assert.equal(needsAgendaImport(session, 62000), true);
});
