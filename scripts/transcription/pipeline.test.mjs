import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioJoinTimedOut, createResampler, readRecallAudio, recordingConfig } from './audio.mjs';
import { createInterventionGate, isVoicedPcm, streamMeetingAudio, MODEL } from './pipeline.mjs';

const voiced = Buffer.alloc(6400);
for (let i = 0; i < voiced.length; i += 2) voiced.writeInt16LE(1000, i);
const silent = Buffer.alloc(6400);

function fakeClock() {
  let time = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => time,
    schedule(fn, delay) { const id = ++nextId; timers.set(id, { fn, due: time + delay }); return id; },
    unschedule(id) { timers.delete(id); },
    async advance(ms) {
      time += ms;
      for (let pass = 0; pass < 10; pass++) {
        const due = [...timers].filter(([, value]) => value.due <= time);
        if (!due.length) break;
        for (const [id, value] of due) { timers.delete(id); value.fn(); }
        await new Promise(resolve => setImmediate(resolve));
      }
    },
  };
}

test('resampling is continuous across Recall packet boundaries', () => {
  const source = Buffer.alloc(6400);
  for (let i = 0; i < 3200; i++) source.writeInt16LE(Math.round(Math.sin(i / 20) * 10000), i * 2);
  const whole = createResampler()(source);
  const resample = createResampler();
  const split = Buffer.concat([resample(source.subarray(0, 2000)), resample(source.subarray(2000))]);
  assert.equal(whole.length, split.length);
  for (let i = 0; i < whole.length; i += 2) assert.ok(Math.abs(whole.readInt16LE(i) - split.readInt16LE(i)) <= 1);
});

test('Recall validates bot identity, base64 and PCM; unrelated events are ignored', () => {
  const payload = { event: 'audio_mixed_raw.data', data: { bot: { id: 'bot' }, data: { buffer: 'AAABAA==' } } };
  assert.equal(readRecallAudio(JSON.stringify(payload), 'bot').length, 4);
  assert.throws(() => readRecallAudio(JSON.stringify(payload), 'other'));
  payload.data.data.buffer = 'secret?';
  assert.throws(() => readRecallAudio(JSON.stringify(payload), 'bot'));
  assert.equal(readRecallAudio('{"event":"participant_events.join"}', 'bot'), null);
  const config = recordingConfig('wss://example.test/old?old=value', 'x'.repeat(32));
  assert.equal(new URL(config.realtime_endpoints[0].url).pathname, '/recall/audio/');
  assert.deepEqual(config.realtime_endpoints[0].events, ['audio_mixed_raw.data']);
});

test('waiting-room admission can take nine minutes before no-audio timeout', () => {
  const state = { audioEnabled: true, createdAt: new Date(1000).toISOString() };
  assert.equal(audioJoinTimedOut(state, 600000), false);
  assert.equal(audioJoinTimedOut(state, 661000), true);
  assert.equal(audioJoinTimedOut({ ...state, audioEnabled: false }, 999999), false);
});

test('Gateway gets continuous PCM stream, Japanese and low delay; final is distinct from provisional text', async () => {
  const events = [];
  const audio = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(voiced)); controller.close(); } });
  const text = await streamMeetingAudio(audio, { apiKey: 'test', onPart: part => events.push(part), transcribe: options => {
    assert.equal(options.model.modelId, MODEL);
    assert.deepEqual(options.inputAudioFormat, { type: 'audio/pcm', rate: 24000 });
    assert.deepEqual(options.providerOptions.openai, { language: 'ja', streaming: { delay: 'low' } });
    assert.equal(options.audio, audio);
    return { fullStream: (async function* () { yield { type: 'transcript-delta', delta: '途中' }; yield { type: 'transcript-final', text: '確定' }; })(), text: Promise.resolve('確定') };
  } });
  assert.equal(text, '確定');
  assert.deepEqual(events.map(event => event.type), ['transcript-delta', 'transcript-final']);
});

test('speech longer than five seconds and a short pause never trigger mid-speech', async () => {
  const clock = fakeClock();
  const decisions = [];
  const displays = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, decide: async input => { decisions.push(input); return { action: 'INTERVENE', reason: 'drift', message: 'return' }; }, display: async input => displays.push(input) });
  assert.equal(isVoicedPcm(silent), false);
  assert.equal(isVoicedPcm(voiced), true);
  gate.onPart({ type: 'transcript-final', text: 'silence hallucination' });
  await clock.advance(2000);
  assert.equal(decisions.length, 0);
  gate.onAudio(voiced);
  gate.onPart({ type: 'transcript-delta', delta: 'provisional' });
  assert.equal(gate.partial, 'provisional');
  gate.onPart({ type: 'transcript-final', text: 'confirmed' });
  for (let i = 0; i < 30; i++) { await clock.advance(200); gate.onAudio(voiced); }
  assert.equal(decisions.length, 0);
  await clock.advance(1400);
  assert.equal(decisions.length, 0);
  gate.onAudio(voiced);
  await clock.advance(1500);
  assert.equal(decisions.length, 1);
  assert.equal(displays.length, 1);
  assert.deepEqual(decisions[0].transcript, ['confirmed']);
});

test('speech resuming during async decision cancels display', async () => {
  const clock = fakeClock();
  let complete;
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, decide: () => new Promise(resolve => { complete = resolve; }), display: async () => { displays++; } });
  gate.onAudio(voiced);
  gate.onPart({ type: 'transcript-final', text: 'final' });
  await clock.advance(1500);
  gate.onAudio(voiced);
  complete({ action: 'INTERVENE', reason: 'drift', message: 'return' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(displays, 0);
});

test('new final during an in-flight decision is not stranded', async () => {
  const clock = fakeClock();
  const decisions = [];
  let complete;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, decide: input => {
    decisions.push(input);
    return decisions.length === 1 ? new Promise(resolve => { complete = resolve; }) : Promise.resolve({ action: 'WAIT', reason: '', message: null });
  }, display: async () => {} });
  gate.onAudio(voiced);
  gate.onPart({ type: 'transcript-final', text: 'first' });
  await clock.advance(1500);
  gate.onAudio(voiced);
  gate.onPart({ type: 'transcript-final', text: 'second' });
  complete({ action: 'WAIT', reason: '', message: null });
  await new Promise(resolve => setImmediate(resolve));
  await clock.advance(1500);
  assert.equal(decisions.length, 2);
  assert.deepEqual(decisions[1].transcript, ['first', 'second']);
});

test('history stays under the video API byte limit and a cancelled card does not start cooldown', async () => {
  const clock = fakeClock();
  const decisions = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, decide: async input => {
    decisions.push(input);
    return { action: 'INTERVENE', reason: 'drift', message: null };
  }, display: async () => ({ cancelled: true }) });
  for (let i = 0; i < 30; i++) {
    gate.onAudio(voiced);
    gate.onPart({ type: 'transcript-final', text: 'あ'.repeat(1000) });
    await clock.advance(1500);
    assert.ok(Buffer.byteLength(JSON.stringify(decisions.at(-1).transcript)) <= 8000);
  }
  assert.equal(decisions.at(-1).secondsSinceLastIntervention, 60);
});

test('decision failure stops the gate and reports degradation', async () => {
  const clock = fakeClock();
  let errors = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, decide: async () => { throw new Error('upstream'); }, display: async () => {}, onError: () => { errors++; } });
  gate.onAudio(voiced);
  gate.onPart({ type: 'transcript-final', text: 'final' });
  await clock.advance(1500);
  assert.equal(gate.stopped, true);
  assert.equal(errors, 1);
});
