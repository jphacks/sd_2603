import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRecallAudioCapture } from './capture.mjs';

const voiced = Buffer.alloc(6400, 1);
const silent = Buffer.alloc(6400);

test('capture is disabled by default and never creates a file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'recall-capture-test-'));
  try {
    assert.equal(createRecallAudioCapture({ directory }), null);
    assert.deepEqual(readdirSync(directory), []);
  } finally { rmSync(directory, { recursive: true }); }
});

test('opt-in capture starts on voice, writes bounded PCM16 WAV, and closes once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'recall-capture-test-'));
  const completed = [];
  let now = 0;
  try {
    const capture = createRecallAudioCapture({ enabled: true, directory, now: () => now, maxMs: 1000, maxBytes: 12800,
      onFinish: summary => completed.push(summary) });
    capture.push(silent, false);
    assert.deepEqual(readdirSync(directory), []);
    capture.push(voiced, true);
    now = 200;
    capture.push(silent, false);
    capture.push(voiced, true);
    capture.finish();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].bytes, 12800);
    assert.equal(completed[0].seconds, 0.4);
    assert.deepEqual(readdirSync(directory), [capture.fileName]);
    const wav = readFileSync(join(directory, capture.fileName));
    assert.equal(wav.length, 12844);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt32LE(24), 16000);
    assert.equal(wav.readUInt32LE(40), 12800);
    assert.deepEqual(wav.subarray(44, 44 + voiced.length), voiced);
    capture.push(voiced, true);
    assert.equal(completed.length, 1);
  } finally { rmSync(directory, { recursive: true }); }
});

test('wall-clock cutoff and capture write errors do not silently continue', () => {
  const directory = mkdtempSync(join(tmpdir(), 'recall-capture-test-'));
  let now = 0;
  try {
    const capture = createRecallAudioCapture({ enabled: true, directory, now: () => now, maxMs: 300 });
    capture.push(voiced, true);
    now = 300;
    capture.push(voiced, true);
    const wav = readFileSync(join(directory, capture.fileName));
    assert.equal(wav.readUInt32LE(40), voiced.length);
    assert.throws(() => createRecallAudioCapture({ enabled: true, directory: join(directory, 'missing') }).push(voiced, true),
      { code: 'ENOENT' });
  } finally { rmSync(directory, { recursive: true }); }
});
