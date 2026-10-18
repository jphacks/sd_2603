import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSegmentedTranscriber } from './segments.mjs';
import { createInterventionGate } from './pipeline.mjs';

const voiced = Buffer.alloc(6400);
for (let i = 0; i < voiced.length; i += 2) voiced.writeInt16LE(1000, i);
const silent = Buffer.alloc(6400);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  throw new Error('Timed out waiting for local test state');
}
function closeUtterance(segments) { for (let i = 0; i < 6; i++) segments.push(silent); }

test('streams first speech immediately, buffers next until prior final, and preserves order', async () => {
  const started = [];
  const releases = [];
  const events = [];
  const pending = [];
  let failures = 0;
  const segments = createSegmentedTranscriber({
    onPart: part => events.push(part),
    onPendingChange: value => pending.push(value),
    onError: () => { failures++; },
    transcribe: async (audio, { onPart }) => {
      const index = started.length;
      started.push(index);
      let bytes = 0;
      for await (const chunk of audio) {
        bytes += chunk.length;
        if (bytes === chunk.length) onPart({ type: 'transcript-delta', delta: `partial-${index}` });
      }
      await new Promise(resolve => { releases[index] = resolve; });
      onPart({ type: 'transcript-final', text: `final-${index}` });
    },
  });
  segments.push(voiced);
  await until(() => started.length === 1 && events.length === 1);
  assert.equal(segments.pending, true);
  closeUtterance(segments);
  segments.push(voiced);
  closeUtterance(segments);
  assert.equal(started.length, 1, 'second utterance waits while first final is pending');
  await until(() => releases[0]);
  releases[0]();
  await until(() => started.length === 2 && releases[1]);
  releases[1]();
  await until(() => !segments.pending);
  assert.equal(failures, 0);
  assert.deepEqual(events.filter(part => part.type === 'transcript-final').map(part => part.text), ['final-0', 'final-1']);
  assert.deepEqual(pending, [true, false]);
  segments.stop();
});

test('pending audio holds both evaluation and quiet-display check until all finals arrive', async () => {
  let now = 0;
  const timers = new Map();
  let nextId = 0;
  const schedule = (fn, ms) => { const id = ++nextId; timers.set(id, { fn, due: now + ms }); return id; };
  const unschedule = id => timers.delete(id);
  const advance = async ms => {
    now += ms;
    for (let i = 0; i < 10; i++) {
      const due = [...timers].filter(([, timer]) => timer.due <= now);
      if (!due.length) break;
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
      await tick();
    }
  };
  const decisions = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', now: () => now, schedule, unschedule,
    decide: async input => { decisions.push(input); return { action: 'INTERVENE' }; }, display: async () => {} });
  const releases = [];
  const segments = createSegmentedTranscriber({
    onPart: part => gate.onPart(part), onPendingChange: value => gate.setPendingAudio(value),
    transcribe: async (audio, { onPart }) => {
      const index = releases.length;
      for await (const chunk of audio) { void chunk; /* Consume the input stream. */ }
      await new Promise(resolve => { releases[index] = resolve; });
      onPart({ type: 'transcript-final', text: `final-${index}` });
    },
  });
  gate.onAudio(voiced); segments.push(voiced); closeUtterance(segments);
  await until(() => releases[0]);
  gate.onAudio(voiced); segments.push(voiced); closeUtterance(segments);
  await advance(2000);
  releases[0]();
  await until(() => releases[1]);
  await advance(2000);
  assert.equal(decisions.length, 0);
  assert.equal(gate.isQuiet(2), false);
  releases[1]();
  await until(() => !segments.pending);
  await advance(0);
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0].transcript, ['final-0', 'final-1']);
  gate.stop(); segments.stop();
});

test('bounded audio and missing final fail closed without retry', async () => {
  const failures = [];
  let calls = 0;
  const segments = createSegmentedTranscriber({ maxBufferedBytes: 7000, onPart: () => {}, onError: error => failures.push(error.message),
    transcribe: async () => { calls++; } });
  segments.push(voiced);
  segments.push(voiced);
  assert.deepEqual(failures, ['STT audio buffer limit']);
  await tick();
  assert.equal(calls, 0);
  assert.equal(segments.pending, false);

  const noFinal = createSegmentedTranscriber({ onPart: () => {}, onError: error => failures.push(error.message),
    transcribe: async audio => { for await (const chunk of audio) { void chunk; /* Consume the input stream. */ } } });
  noFinal.push(voiced); closeUtterance(noFinal);
  await until(() => failures.length === 2);
  assert.equal(failures[1], 'STT ended without a completed utterance');
});

test('a confirmed empty segment is skipped and the next segment still completes', async () => {
  const events = [];
  const failures = [];
  let calls = 0;
  const segments = createSegmentedTranscriber({
    onPart: part => events.push(part),
    onError: error => failures.push(error),
    transcribe: async (audio, { onPart }) => {
      for await (const chunk of audio) { void chunk; /* Consume the closed utterance. */ }
      if (++calls === 1) {
        onPart({ type: 'transcript-empty' });
        return { skippedEmpty: true };
      }
      onPart({ type: 'transcript-final', text: 'second' });
    },
  });
  segments.push(voiced); closeUtterance(segments);
  segments.push(voiced); closeUtterance(segments);
  await until(() => !segments.pending);
  assert.equal(calls, 2);
  assert.deepEqual(events, [{ type: 'transcript-empty' }, { type: 'transcript-final', text: 'second' }]);
  assert.deepEqual(failures, []);
  segments.stop();
});
