import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAudioFailure } from './diagnostics.mjs';

test('failure diagnostics expose only bounded structural values', () => {
  const error = Object.assign(new Error('private transcript and token'), {
    name: 'AI_NoTranscriptGeneratedError', code: 'UPSTREAM_TIMEOUT', statusCode: 502,
  });
  const detail = classifyAudioFailure(error, 'transcription', { activeSegment: 1, activeClosed: true });
  assert.deepEqual(detail, { stage: 'transcription', errorName: 'AI_NoTranscriptGeneratedError', code: 'UPSTREAM_TIMEOUT', status: 502, activeSegment: 1, activeClosed: true });
  assert.equal(JSON.stringify(detail).includes('private'), false);
  assert.deepEqual(classifyAudioFailure({ name: 'secret value', code: 'token=abc', message: 'STT final timeout' }, 'transcription'), {
    stage: 'transcription', errorName: 'UnknownError', reason: 'final_timeout',
  });
});
