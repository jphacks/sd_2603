import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePcmWav, pcm16Chunks, pcm24Chunks } from './wav.mjs';

function wav(rate, samples = 3200) {
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i / 20) * 1000), 44 + i * 2);
  return bytes;
}

test('parses PCM WAV and yields deterministic 24 kHz chunks', () => {
  const parsed = parsePcmWav(wav(16000));
  const chunks = [...pcm24Chunks(parsed)];
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].source.length, 6400);
  assert.ok(chunks[0].pcm24.length >= 9598);
  assert.ok(chunks[0].pcm24.length <= 9602);
  const native = [...pcm24Chunks(parsePcmWav(wav(24000)))];
  assert.equal(Buffer.concat(native.map(chunk => chunk.pcm24)).length, 6400);
  assert.equal(Buffer.concat([...pcm16Chunks(parsePcmWav(wav(24000)))]).length, 4266);
  assert.equal(Buffer.concat([...pcm16Chunks(parsed)]).length, 6400);
});

test('rejects wrong format and truncated chunks', () => {
  const stereo = wav(16000);
  stereo.writeUInt16LE(2, 22);
  assert.throws(() => parsePcmWav(stereo), /mono PCM16/);
  const truncated = wav(16000).subarray(0, 50);
  assert.throws(() => parsePcmWav(truncated));
  assert.throws(() => parsePcmWav(wav(44100)), /mono PCM16/);
});
