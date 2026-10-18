import { randomUUID } from 'node:crypto';
import { closeSync, openSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const RATE = 16_000;
const MAX_MS = 90_000;
const MAX_BYTES = RATE * 2 * MAX_MS / 1000;

function wavHeader(bytes) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);
  return header;
}

function writeAll(fd, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (!written) throw new Error('Diagnostic audio write failed');
    offset += written;
  }
}

/** Explicit opt-in only. Store at most 90 seconds of received PCM in a new local temp WAV. */
export function createRecallAudioCapture({ enabled = false, directory = tmpdir(), now = Date.now, maxMs = MAX_MS, maxBytes = MAX_BYTES, onFinish = () => {}, onError = () => {} } = {}) {
  if (!enabled) return null;
  const path = join(directory, `recall-audio-${randomUUID()}.wav`);
  let fd;
  let startedAt;
  let bytes = 0;
  let finished = false;
  let timer;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    if (fd === undefined) return;
    try {
      writeAll(fd, wavHeader(bytes), 0);
    } finally {
      closeSync(fd);
      fd = undefined;
    }
    onFinish({ fileName: basename(path), bytes, seconds: bytes / (RATE * 2) });
  };

  return {
    push(pcm, voiced) {
      if (finished) return;
      if (!Buffer.isBuffer(pcm) || pcm.length % 2) throw new Error('Invalid diagnostic PCM');
      if (startedAt === undefined) {
        if (!voiced) return;
        startedAt = now();
        fd = openSync(path, 'wx', 0o600);
        writeAll(fd, wavHeader(0), 0);
        timer = setTimeout(() => { try { finish(); } catch (error) { onError(error); } }, maxMs);
        timer.unref?.();
      }
      if (now() - startedAt >= maxMs) { finish(); return; }
      const remaining = maxBytes - bytes;
      const take = Math.min(pcm.length, remaining) & ~1;
      if (take) {
        writeAll(fd, pcm.subarray(0, take), 44 + bytes);
        bytes += take;
      }
      if (bytes >= maxBytes) finish();
    },
    finish,
    get fileName() { return basename(path); },
    get bytes() { return bytes; },
  };
}
