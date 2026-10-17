import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResampler, readRecallAudio, recordingConfig } from './audio.mjs';
import { createMeetingPipeline, transcribeTurn, MODEL } from './pipeline.mjs';

test('resampling is continuous across Recall packet boundaries', () => {
  const source = Buffer.alloc(6400);
  for (let i = 0; i < 3200; i++) source.writeInt16LE(Math.round(Math.sin(i / 20) * 10000), i * 2);
  const whole = createResampler()(source);
  const resample = createResampler();
  const split = Buffer.concat([resample(source.subarray(0, 2000)), resample(source.subarray(2000))]);
  assert.equal(whole.length, split.length);
  for (let i = 0; i < whole.length; i += 2) assert.ok(Math.abs(whole.readInt16LE(i) - split.readInt16LE(i)) <= 1);
  assert.ok(Math.abs(whole.length - 9600) <= 4);
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
  assert.throws(() => recordingConfig('https://example.test', 'x'.repeat(32)));
});

test('Gateway uses the requested model and PCM rate, returns only final text', async () => {
  const text = await transcribeTurn(Buffer.alloc(20), { apiKey: 'test', transcribe: (options) => {
    assert.equal(options.model.modelId, MODEL);
    assert.deepEqual(options.inputAudioFormat, { type: 'audio/pcm', rate: 24000 });
    return { fullStream: (async function* () { yield { type: 'transcript-delta', delta: '途中' }; })(), text: Promise.resolve(' 確定した発言 ') };
  } });
  assert.equal(text, '確定した発言');
  await assert.rejects(transcribeTurn(Buffer.alloc(20), { apiKey: 'test', transcribe: () => ({ fullStream: (async function* () { yield { type: 'error', error: 'secret' }; })() }) }), /upstream failed/);
});

test('confirmed turns reach the judge with bounded context and intervention cooldown', async () => {
  let time = 1000;
  const inputs = [];
  const results = [];
  const pipeline = createMeetingPipeline({ agenda: '議題', now: () => time, decide: async (input) => {
    inputs.push(input);
    return { action: inputs.length === 1 ? 'INTERVENE' : 'SILENCE', reason: 'test', message: null };
  }, onResult: result => results.push(result) });
  await pipeline('');
  assert.equal(inputs.length, 0);
  await pipeline('発言1');
  time += 10000;
  await pipeline('発言2');
  assert.equal(inputs[0].secondsSinceLastIntervention, 60);
  assert.equal(inputs[1].secondsSinceLastIntervention, 10);
  assert.deepEqual(inputs[1].transcript, ['発言1', '発言2']);
  await pipeline('あ'.repeat(40000));
  assert.equal(inputs[2].transcript.length, 30);
  assert.ok(inputs[2].transcript.every(text => text.length <= 1000));
  assert.equal(results.length, 3);
});
