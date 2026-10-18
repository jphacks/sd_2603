import { readFile } from 'node:fs/promises';
import { createResampler } from './audio.mjs';

/** Read a bounded mono PCM16 WAV for deterministic local transcription replay. */
export function parsePcmWav(bytes) {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Expected a RIFF/WAVE file');
  }
  if (bytes.length > 10_000_000 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('Invalid WAV size');
  let format;
  let pcm;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (length > bytes.length - start) throw new Error('Invalid WAV chunk');
    const type = bytes.toString('ascii', offset, offset + 4);
    if (type === 'fmt ') {
      if (length < 16) throw new Error('Invalid WAV format');
      format = { encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), rate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    }
    if (type === 'data') pcm = bytes.subarray(start, start + length);
    offset = start + length + (length % 2);
  }
  if (!format || !pcm || format.encoding !== 1 || format.channels !== 1 || format.bits !== 16 || ![16000, 24000].includes(format.rate) || pcm.length % 2 || pcm.length === 0) {
    throw new Error('Expected mono PCM16 WAV at 16 or 24 kHz');
  }
  if (pcm.length / (format.rate * 2) > 60) throw new Error('WAV must be at most 60 seconds');
  return { rate: format.rate, pcm };
}

export async function readPcmWav(path) {
  return parsePcmWav(await readFile(path));
}

export function* pcm24Chunks({ rate, pcm }, chunkMs = 200) {
  const resample = rate === 16000 ? createResampler() : null;
  const chunkBytes = rate * 2 * chunkMs / 1000;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) throw new Error('Invalid chunk duration');
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    const source = pcm.subarray(offset, Math.min(offset + chunkBytes, pcm.length));
    yield { source, pcm24: resample ? resample(source) : source };
  }
}

/** Convert a WAV sample to Recall's 16 kHz mono PCM frames for worker replay. */
export function* pcm16Chunks({ rate, pcm }, chunkMs = 200) {
  let source = pcm;
  if (rate === 24000) {
    const samples = Math.floor((pcm.length / 2) * 2 / 3);
    source = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      const position = i * 1.5;
      const left = Math.floor(position);
      const fraction = position - left;
      const a = pcm.readInt16LE(left * 2);
      const b = pcm.readInt16LE(Math.min(left + 1, pcm.length / 2 - 1) * 2);
      source.writeInt16LE(Math.round(a * (1 - fraction) + b * fraction), i * 2);
    }
  }
  const chunkBytes = 16000 * 2 * chunkMs / 1000;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) throw new Error('Invalid chunk duration');
  for (let offset = 0; offset < source.length; offset += chunkBytes) yield source.subarray(offset, Math.min(offset + chunkBytes, source.length));
}
