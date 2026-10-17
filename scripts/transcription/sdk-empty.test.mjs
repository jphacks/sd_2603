import assert from 'node:assert/strict';
import { test } from 'node:test';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { streamMeetingAudio } from './pipeline.mjs';

const audio = () => new ReadableStream({ start(controller) { controller.close(); } });
const modelWith = (...parts) => ({
  specificationVersion: 'v4', provider: 'test', modelId: 'empty-final',
  async doStream() {
    return { stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      for (const part of parts) controller.enqueue(part);
      controller.close();
    } }) };
  },
});

test('installed SDK forwards an empty final, then rejects an empty aggregate finish', async () => {
  const model = modelWith({ type: 'transcript-final', text: '' }, { type: 'finish', text: '' });
  const result = streamTranscribe({ model, audio: audio(), inputAudioFormat: { type: 'audio/pcm', rate: 24000 } });
  const seen = [];
  await assert.rejects(async () => {
    for await (const part of result.fullStream) seen.push(part.type);
  }, { name: 'AI_NoTranscriptGeneratedError' });
  assert.deepEqual(seen, ['transcript-final']);
});

test('normal empty finish is skipped without forwarding an empty final', async () => {
  const parts = [];
  const outcome = await streamMeetingAudio(audio(), {
    apiKey: 'unused',
    upstream: modelWith({ type: 'transcript-final', text: '' }, { type: 'finish', text: '' }),
    onPart: part => parts.push(part),
  });
  assert.deepEqual(outcome, { skippedEmpty: true });
  assert.deepEqual(parts, [{ type: 'transcript-empty' }]);
});

test('missing finish is not misclassified as a normal empty recognition', async () => {
  const parts = [];
  await assert.rejects(() => streamMeetingAudio(audio(), {
    apiKey: 'unused',
    upstream: modelWith({ type: 'transcript-final', text: '' }),
    onPart: part => parts.push(part),
  }), { name: 'AI_NoTranscriptGeneratedError' });
  assert.deepEqual(parts, []);
});

test('empty finish after a nonempty final remains a failure', async () => {
  const parts = [];
  await assert.rejects(() => streamMeetingAudio(audio(), {
    apiKey: 'unused',
    upstream: modelWith({ type: 'transcript-final', text: 'hello' }, { type: 'finish', text: '' }),
    onPart: part => parts.push(part),
  }), { name: 'AI_NoTranscriptGeneratedError' });
  assert.deepEqual(parts, [{ type: 'transcript-final', text: 'hello' }]);
});
