import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioJoinTimedOut, createResampler, readRecallAudio, recordingConfig } from './audio.mjs';
import { createInterventionGate as createGate, isVoicedPcm, streamMeetingAudio, MODEL } from './pipeline.mjs';
import { withDeviceControls } from '../../lib/device/judge.ts';
import { createDeviceStore } from '../../lib/device/state.ts';
import { silenceJudge } from '../../lib/judge/silence.ts';

const voiced = Buffer.alloc(6400);
for (let i = 0; i < voiced.length; i += 2) voiced.writeInt16LE(1000, i);
const silent = Buffer.alloc(6400);
// Delivery tests isolate quiet/epoch behavior; cadence has dedicated coverage below.
const createInterventionGate = options => createGate({ decisionIntervalMs: 0, ...options });

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

test('speech is evaluated from finals but a short pause never displays mid-speech', async () => {
  const clock = fakeClock();
  const decisions = [];
  const displays = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, decide: async input => { decisions.push(input); return { action: 'INTERVENE', reason: 'Discussion appears stalled', message: 'return' }; }, display: async input => displays.push(input) });
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
  assert.equal(decisions.length, 1);
  assert.equal(displays.length, 0);
  await clock.advance(1400);
  assert.equal(decisions.length, 1);
  assert.equal(displays.length, 0);
  gate.onAudio(voiced);
  await clock.advance(1500);
  assert.equal(decisions.length, 1);
  assert.equal(displays.length, 1, 'the current recommendation is delivered at the first full quiet boundary');
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

const intervention = { action: 'INTERVENE', reason: 'Discussion appears stalled', message: 'return' };
const tick = () => new Promise(resolve => setImmediate(resolve));
function utterance(gate, text = 'confirmed') {
  gate.onAudio(voiced);
  gate.onPart({ type: 'transcript-final', text });
}

test('successful intervention restores idle after eight seconds, including while speech resumes', async () => {
  const clock = fakeClock();
  const calls = [];
  const decisions = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async input => { decisions.push(input); return intervention; },
    display: async input => { calls.push(['display', input.botId]); },
    restoreIdle: async input => { calls.push(['idle', input.botId]); },
  });
  utterance(gate);
  await clock.advance(1500);
  gate.onAudio(voiced);
  await clock.advance(7999);
  assert.deepEqual(calls, [['display', 'bot']]);
  gate.onAudio(voiced);
  await clock.advance(1);
  assert.deepEqual(calls, [['display', 'bot'], ['idle', 'bot']]);
  assert.equal(decisions.length, 1, 'restoring the image must not call the judge');
  await clock.advance(8000);
  assert.equal(calls.length, 2, 'the restore is one-shot');
  gate.stop();
});

test('a newer card replaces the old restore timer; WAIT never erases the card', async () => {
  const clock = fakeClock();
  const calls = [];
  let decisions = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => ++decisions === 3 ? { action: 'WAIT' } : intervention,
    display: async () => { calls.push('display'); }, restoreIdle: async () => { calls.push('idle'); },
  });
  utterance(gate, 'first');
  await clock.advance(1500);
  await clock.advance(500);
  utterance(gate, 'second');
  await clock.advance(1500);
  utterance(gate, 'third');
  await clock.advance(1500);
  await clock.advance(4500); // The first card's old deadline.
  assert.deepEqual(calls, ['display', 'display']);
  await clock.advance(2000);
  assert.deepEqual(calls, ['display', 'display', 'idle']);
  gate.stop();
});

test('a cancelled display preserves the previous card restore deadline', async () => {
  const clock = fakeClock();
  let displays = 0;
  let restores = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention, display: async () => ({ cancelled: ++displays === 2 }),
    restoreIdle: async () => { restores++; },
  });
  utterance(gate);
  await clock.advance(1500);
  utterance(gate);
  await clock.advance(1500);
  await clock.advance(6500);
  assert.equal(restores, 1);
  gate.stop();
});

test('a restore queued behind a newer in-flight display cannot erase its result', async () => {
  const clock = fakeClock();
  let finishDisplay;
  let displays = 0;
  let restores = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention,
    display: async () => { if (++displays === 2) await new Promise(resolve => { finishDisplay = resolve; }); },
    restoreIdle: async () => { restores++; },
  });
  utterance(gate);
  await clock.advance(1500);
  utterance(gate);
  await clock.advance(1500);
  await clock.advance(6500);
  assert.equal(restores, 0);
  finishDisplay();
  await tick();
  assert.equal(restores, 0, 'the expired old epoch must be skipped inside the video queue');
  await clock.advance(7999);
  assert.equal(restores, 0);
  await clock.advance(1);
  assert.equal(restores, 1);
  gate.stop();
});

test('a newer display waits for an already in-flight restore and remains visible afterwards', async () => {
  const clock = fakeClock();
  let finishIdle;
  const calls = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention,
    display: async () => { calls.push('display'); },
    restoreIdle: async () => { calls.push('idle-start'); await new Promise(resolve => { finishIdle = resolve; }); calls.push('idle-end'); },
  });
  utterance(gate);
  await clock.advance(1500);
  await clock.advance(8000);
  utterance(gate);
  await clock.advance(1500);
  assert.deepEqual(calls, ['display', 'idle-start']);
  finishIdle();
  await tick();
  assert.deepEqual(calls, ['display', 'idle-start', 'idle-end', 'display']);
  gate.stop();
});

test('stop invalidates the timer and aborts an in-flight video request without degradation', async () => {
  const clock = fakeClock();
  let requestSignal;
  let finishIdle;
  let errors = 0;
  let restores = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'old-bot', ...clock,
    decide: async () => intervention, display: async () => {},
    restoreIdle: ({ signal }) => { restores++; requestSignal = signal; return new Promise((resolve, reject) => {
      finishIdle = resolve;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }); },
    onError: () => { errors++; },
  });
  utterance(gate);
  await clock.advance(1500);
  await clock.advance(8000);
  gate.stop();
  assert.equal(requestSignal.aborted, true);
  finishIdle();
  await tick();
  await clock.advance(30000);
  assert.equal(errors, 0);
  assert.equal(restores, 1);
  assert.equal(gate.stopped, true);
});

test('stopping an old meeting cancels its pending timer without affecting another gate', async () => {
  const clock = fakeClock();
  const restoredBots = [];
  const make = botId => createInterventionGate({ agenda: 'agenda', botId, ...clock,
    decide: async () => intervention, display: async () => {},
    restoreIdle: async input => { restoredBots.push(input.botId); },
  });
  const oldGate = make('old');
  utterance(oldGate);
  await clock.advance(1500);
  oldGate.stop();
  const newGate = make('new');
  utterance(newGate);
  await clock.advance(1500);
  await clock.advance(8000);
  assert.deepEqual(restoredBots, ['new']);
  newGate.stop();
});

test('restore failure stops the gate once, with no retry or additional decision', async () => {
  const clock = fakeClock();
  let restores = 0;
  const errors = [];
  const failure = new Error('local idle failure');
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention, display: async () => {},
    restoreIdle: async () => { restores++; throw failure; }, onError: error => { errors.push(error); },
  });
  utterance(gate);
  await clock.advance(1500);
  await clock.advance(8000);
  assert.equal(gate.stopped, true);
  assert.deepEqual(errors, [failure]);
  await clock.advance(30000);
  assert.equal(restores, 1);
});

test('stop during display ignores its late success and never schedules a restore', async () => {
  const clock = fakeClock();
  let finishDisplay;
  let restores = 0;
  let requestSignal;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention,
    display: ({ signal }) => { requestSignal = signal; return new Promise(resolve => { finishDisplay = resolve; }); },
    restoreIdle: async () => { restores++; },
  });
  utterance(gate);
  await clock.advance(1500);
  gate.stop();
  assert.equal(requestSignal.aborted, true);
  finishDisplay();
  await tick();
  await clock.advance(30000);
  assert.equal(restores, 0);
});

test('speech resuming while display waits behind idle is checked again before display', async () => {
  const clock = fakeClock();
  let finishIdle;
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention, display: async () => { displays++; },
    restoreIdle: () => new Promise(resolve => { finishIdle = resolve; }),
  });
  utterance(gate);
  await clock.advance(1500);
  await clock.advance(8000);
  utterance(gate);
  await clock.advance(1500);
  gate.onAudio(voiced);
  finishIdle();
  await tick();
  assert.equal(displays, 1);
  gate.stop();
});

// This score still recommends action in Jev v2. The worker must hold the first
// off-agenda recommendation rather than pretend the model became more accurate.
const offAgenda = { action: 'INTERVENE', reason: 'Discussion appears off agenda', message: 'return',
  diagnostic: { drifted: 0.95, stalled: 0.1, tangentIsRelevant: 0.1, interveneNow: 0.73 } };

test('one trusted manual device event displays once and restores idle without two AI recommendations', async () => {
  const clock = fakeClock();
  const store = createDeviceStore(clock.now);
  const calls = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: withDeviceControls('bot', async () => ({ action: 'SILENCE', reason: 'Cooldown active', message: null }), store),
    display: async input => { calls.push(input.result.reason); },
    restoreIdle: async () => { calls.push('idle'); },
  });
  store.requestManual('bot');
  utterance(gate); await clock.advance(1499);
  assert.deepEqual(calls, [], 'manual still waits for silence');
  await clock.advance(1);
  assert.deepEqual(calls, ['Manual request']);
  await clock.advance(8000);
  assert.deepEqual(calls, ['Manual request', 'idle']);
  utterance(gate); await clock.advance(1500);
  assert.equal(calls.length, 2, 'the device event is consumed only once');
  gate.stop();
});

test('a model manual-looking reason and flag cannot skip the two-recommendation confirmation', async () => {
  const clock = fakeClock();
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: withDeviceControls('bot', async () => ({ ...offAgenda, reason: 'Manual request', manual: true }), createDeviceStore(clock.now)),
    display: async () => { displays++; },
  });
  utterance(gate); await clock.advance(1500);
  assert.equal(displays, 0);
  utterance(gate); await clock.advance(1500);
  assert.equal(displays, 1);
  gate.stop();
});

test('device mute clears a held AI off-agenda candidate before unmuted confirmation', async () => {
  const clock = fakeClock();
  const store = createDeviceStore(clock.now);
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: withDeviceControls('bot', async () => offAgenda, store), display: async () => { displays++; },
  });
  utterance(gate); await clock.advance(1500);
  store.mute('bot');
  utterance(gate); await clock.advance(1500);
  store.unmute('bot');
  utterance(gate); await clock.advance(1500);
  assert.equal(displays, 0);
  utterance(gate); await clock.advance(1500);
  assert.equal(displays, 1);
  gate.stop();
});

test('manual device control never bypasses stale speech or stop', async () => {
  for (const cancellation of ['speech', 'stop']) {
    const clock = fakeClock();
    const store = createDeviceStore(clock.now);
    let complete;
    let displays = 0;
    const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
      decide: withDeviceControls('bot', () => new Promise(resolve => { complete = resolve; }), store),
      display: async () => { displays++; },
    });
    store.requestManual('bot');
    utterance(gate); await clock.advance(1500);
    if (cancellation === 'speech') gate.onAudio(voiced);
    if (cancellation === 'stop') gate.stop();
    complete({ action: 'SILENCE', reason: 'Cooldown active', message: null });
    await tick(); await clock.advance(1500);
    assert.equal(displays, 0, cancellation);
    gate.stop();
  }
});

test('an agenda validation failure cannot become a manual intervention or consume its event', async () => {
  const store = createDeviceStore();
  store.requestManual('bot');
  const judge = withDeviceControls('bot', async () => { throw new Error('agenda changed'); }, store);
  await assert.rejects(judge({}), /agenda changed/);
  assert.equal(store.takeManual('bot'), true);
});

test('a brief aside followed by on-track conversation is held and clears confirmation', async () => {
  const clock = fakeClock();
  const recommendations = [offAgenda, { action: 'SILENCE', reason: 'Conversation is progressing' }, offAgenda];
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => recommendations.shift(), display: async () => { displays++; },
  });
  for (const text of ['brief aside', 'back to agenda', 'another single aside']) {
    utterance(gate, text);
    await clock.advance(1500);
  }
  assert.equal(displays, 0);
  assert.equal(offAgenda.action, 'INTERVENE', 'the model recommendation is not rewritten');
  gate.stop();
});

test('new final confirms off-agenda across voiced and pending audio, then success resets confirmation', async () => {
  const clock = fakeClock();
  const inputs = [];
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async input => { inputs.push(input); return offAgenda; }, display: async () => { displays++; },
  });
  utterance(gate, 'first detour');
  await clock.advance(1500);
  assert.equal(displays, 0);
  gate.onAudio(voiced);
  gate.setPendingAudio(true);
  await clock.advance(2000);
  assert.equal(inputs.length, 1, 'starting audio and waiting for STT cannot count as confirmation');
  gate.onPart({ type: 'transcript-final', text: 'continuing detour' });
  gate.setPendingAudio(false);
  await clock.advance(0);
  assert.equal(displays, 1);
  assert.deepEqual(inputs[1].transcript, ['first detour', 'continuing detour']);
  assert.equal(inputs[1].secondsSinceLastIntervention, 60, 'a held card must not start cooldown');
  utterance(gate, 'another final after display');
  await clock.advance(1500);
  assert.equal(displays, 1, 'successful display clears the old candidate');
  assert.equal(inputs[2].secondsSinceLastIntervention, 1.5);
  gate.stop();
});

test('same-context repeats, duplicate final without new speech, and audio alone never confirm', async () => {
  const clock = fakeClock();
  let decisions = 0;
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => { decisions++; return offAgenda; }, display: async () => { displays++; },
  });
  utterance(gate, 'first detour');
  await clock.advance(1500);
  gate.onPart({ type: 'transcript-final', text: 'first detour' });
  for (let i = 0; i < 3; i++) { gate.setPendingAudio(false); await clock.advance(1500); }
  gate.onAudio(voiced);
  await clock.advance(1500);
  assert.equal(decisions, 1);
  assert.equal(displays, 0);
  gate.stop();
  utterance(gate, 'after stop');
  await clock.advance(1500);
  assert.equal(decisions, 1);
});

test('stale off-agenda recommendation is not counted; two later valid finals are required', async () => {
  const clock = fakeClock();
  let finishFirst;
  let decisions = 0;
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: () => ++decisions === 1 ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve(offAgenda),
    display: async () => { displays++; },
  });
  utterance(gate, 'old context');
  await clock.advance(1500);
  utterance(gate, 'new context while deciding');
  finishFirst(offAgenda);
  await tick();
  await clock.advance(1500);
  assert.equal(decisions, 2);
  assert.equal(displays, 0);
  utterance(gate, 'continued detour');
  await clock.advance(1500);
  assert.equal(displays, 1);
  gate.stop();
});

test('valid WAIT and changed reasons reset off-agenda confirmation', async () => {
  const clock = fakeClock();
  const results = [offAgenda, { action: 'WAIT' }, offAgenda,
    { ...offAgenda, reason: 'different off-agenda reason' }, offAgenda, offAgenda];
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => results.shift(), display: async () => { displays++; },
  });
  for (let i = 0; i < 5; i++) { utterance(gate, `final ${i}`); await clock.advance(1500); assert.equal(displays, 0); }
  utterance(gate, 'sixth final');
  await clock.advance(1500);
  assert.equal(displays, 1);
  gate.stop();
});

test('stalled recommendation displays immediately and is not an off-agenda confirmation', async () => {
  const clock = fakeClock();
  const results = [offAgenda, intervention, offAgenda];
  const displayedReasons = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => results.shift(), display: async input => { displayedReasons.push(input.result.reason); },
  });
  for (let i = 0; i < 3; i++) { utterance(gate, `final ${i}`); await clock.advance(1500); }
  assert.deepEqual(displayedReasons, ['Discussion appears stalled']);
  gate.stop();
});

test('dynamic agenda changes discard the previous off-agenda vote and bind judge and display', async () => {
  const clock = fakeClock();
  let snapshot = { agenda: 'first agenda', agendaVersion: 'v1' };
  const decisions = [];
  const displays = [];
  const gate = createInterventionGate({ agenda: 'initial', botId: 'bot', ...clock,
    resolveAgenda: async () => snapshot,
    decide: async input => { decisions.push(input); return offAgenda; }, display: async input => { displays.push(input); },
  });
  utterance(gate, 'first detour'); await clock.advance(1500);
  snapshot = { agenda: 'second agenda', agendaVersion: 'v2' };
  utterance(gate, 'new agenda detour'); await clock.advance(1500);
  assert.equal(displays.length, 0, 'the old agenda cannot supply the first confirmation');
  utterance(gate, 'continued new agenda detour'); await clock.advance(1500);
  assert.equal(displays.length, 1);
  assert.equal(decisions[1].agenda, snapshot.agenda);
  assert.equal(displays[0].agenda, snapshot.agenda);
  assert.equal(displays[0].agendaVersion, 'v2');
  snapshot = { ...snapshot, agendaVersion: 'v3' };
  utterance(gate, 'same text new generation'); await clock.advance(1500);
  assert.equal(displays.length, 1);
  gate.stop();
});

test('a full-length dynamic agenda leaves room for bounded transcript in the 12KB request', async () => {
  const clock = fakeClock();
  const inputs = [];
  const gate = createInterventionGate({ agenda: 'initial', botId: '00000000-0000-4000-8000-000000000001', ...clock,
    resolveAgenda: async () => ({ agenda: '議'.repeat(2000), agendaVersion: 'a'.repeat(64) }),
    decide: async input => { inputs.push(input); return { action: 'WAIT' }; }, display: async () => {},
  });
  for (let i = 0; i < 5; i++) { utterance(gate, '話'.repeat(1000)); await clock.advance(1500); }
  for (const input of inputs) assert.ok(Buffer.byteLength(JSON.stringify({ mode: 'evaluate', ...input })) < 12000);
  gate.stop();
});

test('agenda updates during a model request or guarded display cancel and clear confirmation', async () => {
  for (const stage of ['decide', 'display']) {
    const clock = fakeClock();
    let rejectOnce = true;
    let displays = 0;
    const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
      resolveAgenda: async () => ({ agenda: 'agenda', agendaVersion: 'v1' }),
      decide: async () => stage === 'decide' && rejectOnce ? (rejectOnce = false, { cancelled: true }) : offAgenda,
      display: async () => { displays++; if (rejectOnce) { rejectOnce = false; return { cancelled: true }; } },
    });
    const initialFinals = stage === 'decide' ? 1 : 2;
    for (let i = 0; i < initialFinals; i++) { utterance(gate, `old ${i}`); await clock.advance(1500); }
    const attempts = displays;
    utterance(gate, 'new first vote'); await clock.advance(1500);
    assert.equal(displays, attempts, `${stage} cancellation must erase the candidate`);
    utterance(gate, 'new second vote'); await clock.advance(1500);
    assert.equal(displays, attempts + 1);
    assert.equal(gate.stopped, false);
    gate.stop();
  }
});

test('agenda lookup pending holds safely, lookup failure stops, and resumed speech cancels stale lookup', async () => {
  const clock = fakeClock();
  let snapshot = { cancelled: true };
  let decisions = 0;
  const histories = [];
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    resolveAgenda: async () => snapshot,
    decide: async input => { decisions++; histories.push(input.transcript); return offAgenda; }, display: async () => { displays++; },
  });
  utterance(gate, 'pending source'); await clock.advance(1500);
  assert.equal(decisions, 0);
  snapshot = { agenda: 'new agenda', agendaVersion: 'v2' };
  utterance(gate, 'first valid new agenda'); await clock.advance(1500);
  assert.equal(displays, 0);
  assert.deepEqual(histories, [['pending source', 'first valid new agenda']]);
  gate.stop();
  let errors = 0;
  const failed = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    resolveAgenda: async () => { throw new Error('unavailable'); }, decide: async () => { throw new Error('must not judge'); }, display: async () => {}, onError: () => { errors++; },
  });
  utterance(failed); await clock.advance(1500);
  assert.equal(failed.stopped, true);
  assert.equal(errors, 1);
  let finish;
  const resumed = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    resolveAgenda: () => new Promise(resolve => { finish = resolve; }), decide: async () => { decisions++; return offAgenda; }, display: async () => { displays++; },
  });
  utterance(resumed); await clock.advance(1500);
  resumed.onAudio(voiced);
  finish(snapshot); await tick();
  assert.equal(decisions, 1);
  resumed.stop();
});

test('default background cadence is final-driven, ten seconds apart and single-flight', async () => {
  const clock = fakeClock();
  let complete;
  const inputs = [];
  let displays = 0;
  const gate = createGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: input => { inputs.push(input); return new Promise(resolve => { complete = resolve; }); },
    display: async () => { displays++; },
  });
  gate.setPendingAudio(true);
  utterance(gate, 'first final'); await clock.advance(0);
  assert.equal(inputs.length, 1, 'pending STT and active speech do not block evaluation');
  for (let i = 0; i < 10; i++) { gate.onAudio(voiced); await clock.advance(1000); }
  gate.onPart({ type: 'transcript-final', text: 'second final' });
  await clock.advance(0);
  assert.equal(inputs.length, 1, 'new context cannot start a concurrent request');
  complete(intervention); await tick(); await clock.advance(0);
  assert.equal(inputs.length, 2, 'queued latest context is evaluated after the prior request');
  assert.deepEqual(inputs[1].transcript, ['first final', 'second final']);
  complete(intervention); await tick();
  for (let i = 0; i < 5; i++) { gate.onAudio(voiced); await clock.advance(1000); }
  gate.onPart({ type: 'transcript-final', text: 'third final' }); await clock.advance(0);
  assert.equal(inputs.length, 2, 'burst finals are coalesced into the next cadence');
  for (let i = 0; i < 5; i++) { gate.onAudio(voiced); await clock.advance(1000); }
  assert.equal(inputs.length, 3);
  complete(intervention); await tick();
  assert.equal(displays, 0, 'internal recommendations never display during continuous speech');
  gate.setPendingAudio(false); await clock.advance(1500);
  assert.equal(displays, 1, 'the latest recommendation is delivered without another model call');
  assert.equal(inputs.length, 3);
  gate.stop();
});

test('a new final invalidates a held recommendation until its own background decision completes', async () => {
  const clock = fakeClock();
  let decisions = 0;
  let displays = 0;
  const gate = createGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => ++decisions === 1 ? intervention : { action: 'WAIT' },
    display: async () => { displays++; },
  });
  gate.setPendingAudio(true);
  utterance(gate, 'old drift'); await clock.advance(0);
  gate.onPart({ type: 'transcript-final', text: 'returned to agenda' });
  gate.setPendingAudio(false); await clock.advance(1500);
  assert.equal(displays, 0, 'quiet must not deliver the invalidated old card');
  await clock.advance(8500);
  assert.equal(decisions, 2);
  assert.equal(displays, 0);
  gate.stop();
});

test('held recommendations expire after twenty seconds without paid polling', async () => {
  const clock = fakeClock();
  let decisions = 0;
  let displays = 0;
  const gate = createGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => { decisions++; return intervention; }, display: async () => { displays++; },
  });
  gate.setPendingAudio(true);
  utterance(gate); await clock.advance(0);
  await clock.advance(20000);
  gate.setPendingAudio(false); await clock.advance(0);
  assert.equal(displays, 0);
  assert.equal(decisions, 1);
  gate.stop();
});

test('an expired off-agenda vote cannot confirm a later recommendation', async () => {
  const clock = fakeClock();
  let displays = 0;
  const gate = createGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => offAgenda, display: async () => { displays++; },
  });
  utterance(gate, 'old detour'); await clock.advance(1500);
  await clock.advance(20001);
  utterance(gate, 'unrelated later detour'); await clock.advance(1500);
  assert.equal(displays, 0);
  gate.stop();
});

test('continued off-agenda recommendations renew the confirmation instead of expiring the first vote', async () => {
  const clock = fakeClock();
  let displays = 0;
  const gate = createGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => offAgenda, display: async () => { displays++; },
  });
  gate.setPendingAudio(true);
  for (let final = 0; final < 4; final++) {
    utterance(gate, `continuous detour ${final}`); await clock.advance(0);
    if (final < 3) for (let i = 0; i < 10; i++) { gate.onAudio(voiced); await clock.advance(1000); }
  }
  assert.equal(displays, 0);
  gate.setPendingAudio(false); await clock.advance(1500);
  assert.equal(displays, 1, 'the fourth consecutive vote remains confirmed thirty seconds after the first');
  gate.stop();
});

test('a final arriving during remote rendering invalidates its quiet generation', async () => {
  const clock = fakeClock();
  let displayGeneration;
  let finishDisplay;
  const gate = createGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention,
    display: ({ generation }) => { displayGeneration = generation; return new Promise(resolve => { finishDisplay = resolve; }); },
  });
  utterance(gate, 'judged context'); await clock.advance(1500);
  assert.equal(gate.isQuiet(displayGeneration), true);
  gate.setPendingAudio(true);
  gate.onPart({ type: 'transcript-final', text: 'newly finalized context' });
  gate.setPendingAudio(false);
  assert.equal(gate.isQuiet(displayGeneration), false, 'even after STT pending clears, the old request stays stale');
  finishDisplay({ cancelled: true }); await tick();
  gate.stop();
});

const silenceNudge = { action: 'INTERVENE', reason: 'Meeting has gone silent', message: 'ここまでで、気になる点はありますか？', recommendationId: '00000000-0000-4000-8000-000000000001' };
const keepWatching = { action: 'WAIT', reason: 'Not enough conversation', message: null };
function silenceGate(clock, overrides = {}) {
  const calls = { decide: 0, nudges: [], displays: [] };
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => { calls.decide++; return keepWatching; },
    nudge: async input => { calls.nudges.push(input); return silenceNudge; },
    display: async input => { calls.displays.push(input.result.reason); },
    ...overrides,
  });
  return { gate, calls };
}

test('silence after conversation nudges once at the threshold, without a model call', async () => {
  const clock = fakeClock();
  const { gate, calls } = silenceGate(clock);
  utterance(gate, 'first point');
  await clock.advance(0);
  await clock.advance(1500);
  await clock.advance(18_499);
  assert.equal(calls.nudges.length, 0, 'not before the threshold');
  await clock.advance(1);
  assert.equal(calls.nudges.length, 1);
  assert.deepEqual(calls.nudges[0].transcript, ['first point']);
  assert.equal(calls.nudges[0].secondsSinceLastIntervention, 60);
  assert.equal(calls.decide, 1, 'silence never asks the judge');
  assert.deepEqual(calls.displays, ['Meeting has gone silent']);
  await clock.advance(120_000);
  assert.equal(calls.nudges.length, 1, 'one long silence nudges only once');
  gate.stop();
});

test('no silence nudge before any conversation, or for audio without a final', async () => {
  const clock = fakeClock();
  const { gate, calls } = silenceGate(clock);
  gate.onAudio(silent);
  await clock.advance(60_000);
  gate.onAudio(voiced);
  await clock.advance(1500);
  await clock.advance(60_000);
  assert.equal(calls.nudges.length, 0);
  assert.equal(calls.displays.length, 0);
  gate.stop();
});

test('a new final re-arms the silence timer and allows the next nudge', async () => {
  const clock = fakeClock();
  const { gate, calls } = silenceGate(clock, { cooldownMs: 0 });
  utterance(gate, 'one');
  await clock.advance(0);
  await clock.advance(10_000);
  utterance(gate, 'two');
  await clock.advance(0);
  await clock.advance(1500);
  await clock.advance(18_000);
  assert.equal(calls.nudges.length, 0, 'the timer restarts at the latest final');
  await clock.advance(500);
  assert.equal(calls.nudges.length, 1);
  utterance(gate, 'three');
  await clock.advance(0);
  await clock.advance(1500);
  await clock.advance(18_500);
  assert.equal(calls.nudges.length, 2);
  assert.deepEqual(calls.displays, ['Meeting has gone silent', 'Meeting has gone silent']);
  gate.stop();
});

test('silence waits out the intervention cooldown and needs speech after the last card', async () => {
  const clock = fakeClock();
  let first = true;
  const { gate, calls } = silenceGate(clock, {
    decide: async () => { calls.decide++; if (first) { first = false; return intervention; } return keepWatching; },
  });
  utterance(gate, 'repeating');
  await clock.advance(0);
  await clock.advance(1500);
  assert.deepEqual(calls.displays, ['Discussion appears stalled']);
  await clock.advance(60_000);
  assert.equal(calls.nudges.length, 0, 'a card consumes the conversation that preceded it');
  // t=61500: speech again, then silence while still close to a newer card.
  const { gate: second, calls: secondCalls } = silenceGate(clock, {
    decide: async () => { secondCalls.decide++; return secondCalls.decide === 1 ? intervention : keepWatching; },
  });
  utterance(second, 'a');
  await clock.advance(0);
  await clock.advance(1500); // card at 63000
  await clock.advance(2000);
  utterance(second, 'b'); // 65000
  await clock.advance(0);
  await clock.advance(1500);
  await clock.advance(18_500); // 85000: silent for 20s, but only 22s since the card
  assert.equal(secondCalls.nudges.length, 0, 'cooldown blocks the nudge');
  await clock.advance(37_999);
  assert.equal(secondCalls.nudges.length, 0);
  await clock.advance(1); // 123000 = card + 60s
  assert.equal(secondCalls.nudges.length, 1);
  assert.equal(secondCalls.nudges[0].secondsSinceLastIntervention, 60);
  assert.deepEqual(secondCalls.displays, ['Discussion appears stalled', 'Meeting has gone silent']);
  gate.stop();
  second.stop();
});

test('device mute suppresses the silence nudge on the server path and it is not retried in the same silence', async () => {
  const clock = fakeClock();
  const store = createDeviceStore(clock.now);
  const server = withDeviceControls('bot', silenceJudge, store, { manual: false });
  const { gate, calls } = silenceGate(clock, {
    nudge: async input => { calls.nudges.push(input); return server(input); },
  });
  store.mute('bot');
  utterance(gate, 'tangent');
  await clock.advance(0);
  await clock.advance(1500);
  await clock.advance(18_500);
  assert.equal(calls.nudges.length, 1);
  assert.equal(calls.displays.length, 0, 'muted: no card');
  await clock.advance(60_000);
  assert.equal(calls.nudges.length, 1, 'no repeat during the same silence');
  store.unmute('bot');
  utterance(gate, 'back');
  await clock.advance(0);
  await clock.advance(1500);
  await clock.advance(18_500);
  assert.deepEqual(calls.displays, ['Meeting has gone silent']);
  gate.stop();
});

test('speech or pending recognition defers the silence nudge, and speech during the nudge cancels its card', async () => {
  const clock = fakeClock();
  let release;
  const { gate, calls } = silenceGate(clock, {
    nudge: input => { calls.nudges.push(input); return new Promise(resolve => { release = resolve; }); },
  });
  utterance(gate, 'one');
  await clock.advance(0);
  await clock.advance(1500);
  await clock.advance(17_500);
  gate.setPendingAudio(true);
  await clock.advance(1000);
  assert.equal(calls.nudges.length, 0, 'recognition still pending');
  gate.setPendingAudio(false);
  await clock.advance(1500);
  assert.equal(calls.nudges.length, 1);
  gate.onAudio(voiced);
  release(silenceNudge);
  await clock.advance(30_000);
  assert.equal(calls.displays.length, 0, 'speech resumed while the nudge was in flight');
  gate.stop();
});

test('silence nudge follows the latest agenda version', async () => {
  const clock = fakeClock();
  let version = 'v1';
  const { gate, calls } = silenceGate(clock, {
    resolveAgenda: async () => ({ agenda: 'agenda', agendaVersion: version }),
  });
  utterance(gate, 'one');
  await clock.advance(0);
  version = 'v2';
  await clock.advance(1500);
  await clock.advance(18_500);
  assert.equal(calls.nudges.length, 1);
  assert.equal(calls.nudges[0].agendaVersion, 'v2');
  assert.deepEqual(calls.displays, ['Meeting has gone silent']);
  gate.stop();
});

test('an invalid silence duration is rejected', () => {
  assert.throws(() => createInterventionGate({ agenda: 'a', botId: 'b', decide: async () => keepWatching, display: async () => {}, silenceMs: 0 }), RangeError);
});

// Talk that keeps going with only short gaps between speakers.
async function talk(gate, clock, ms, { final } = {}) {
  for (let elapsed = 0; elapsed < ms; elapsed += 200) { gate.onAudio(voiced); await clock.advance(200); }
  if (final) gate.onPart({ type: 'transcript-final', text: final });
}

test('holdAcrossSpeech shows a confirmed card at the next short pause while talk continues', async () => {
  const run = async options => {
    const clock = fakeClock();
    let displays = 0;
    const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, quietMs: 800, ...options,
      decide: async () => intervention, display: async () => { displays++; } });
    utterance(gate, 'first');
    await talk(gate, clock, 3000, { final: 'second' });
    gate.setPendingAudio(true);
    await talk(gate, clock, 3000);
    assert.equal(displays, 0, 'never while someone is speaking');
    await clock.advance(800);
    gate.stop();
    return displays;
  };
  assert.equal(await run({ holdAcrossSpeech: true }), 1, 'a newer final and pending recognition do not cancel the held card');
  assert.equal(await run({}), 0, 'the default still waits for recognition to finish');
});

test('holdAcrossSpeech drops the held card when a newer judgement says no', async () => {
  const clock = fakeClock();
  const results = [intervention, { action: 'WAIT', reason: 'Conversation needs more observation', message: null }];
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, quietMs: 800, holdAcrossSpeech: true,
    decide: async () => results.shift(), display: async () => { displays++; } });
  utterance(gate, 'first');
  await talk(gate, clock, 2000, { final: 'second' });
  await talk(gate, clock, 2000);
  await clock.advance(800);
  assert.equal(displays, 0);
  gate.stop();
});

test('offAgendaConfirmations 1 displays the first off-agenda recommendation', async () => {
  const clock = fakeClock();
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, offAgendaConfirmations: 1,
    decide: async () => offAgenda, display: async () => { displays++; } });
  utterance(gate); await clock.advance(1500);
  assert.equal(displays, 1);
  gate.stop();
  assert.throws(() => createInterventionGate({ agenda: 'agenda', botId: 'bot', offAgendaConfirmations: 3, decide: async () => offAgenda, display: async () => {} }), RangeError);
});

test('holdAcrossSpeech drops the held card once a newer evaluation starts, then holds the newer one', async () => {
  const clock = fakeClock();
  let finish;
  const results = [async () => intervention, () => new Promise(resolve => { finish = resolve; })];
  let displays = 0;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock, quietMs: 800, holdAcrossSpeech: true,
    decide: () => results.shift()(), display: async () => { displays++; } });
  utterance(gate, 'first');
  await talk(gate, clock, 2000, { final: 'second' });
  await clock.advance(800);
  assert.equal(displays, 0, 'the first card is superseded while the second evaluation is in flight');
  finish(intervention);
  await tick();
  await clock.advance(800);
  assert.equal(displays, 1, 'the newer recommendation is held and shown at the pause');
  gate.stop();
});

test('showIdle puts up the idle face once, queued ahead of a later card', async () => {
  const clock = fakeClock();
  const calls = [];
  let release;
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async () => intervention,
    display: async () => { calls.push('card'); },
    restoreIdle: () => new Promise(resolve => { calls.push('idle'); release = resolve; }),
  });
  const shown = gate.showIdle();
  utterance(gate); await clock.advance(1500);
  assert.deepEqual(calls, ['idle'], 'the card waits for the idle face to finish');
  release(); await shown; await tick(); await tick();
  assert.deepEqual(calls, ['idle', 'card']);
  gate.stop();
  await gate.showIdle();
  assert.equal(calls.length, 2, 'a stopped gate shows nothing');
});

test('a displayed card clears the history, so the next judgement sees only what follows', async () => {
  const clock = fakeClock();
  const seen = [];
  const gate = createInterventionGate({ agenda: 'agenda', botId: 'bot', ...clock,
    decide: async input => { seen.push(input.transcript); return seen.length === 1 ? intervention : { action: 'WAIT', reason: 'x', message: null }; },
    display: async () => {} });
  utterance(gate, 'off-topic talk'); await clock.advance(1500);
  utterance(gate, 'back on the agenda'); await clock.advance(1500);
  assert.deepEqual(seen, [['off-topic talk'], ['back on the agenda']]);
  gate.stop();
});
