import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideFromScores, requestJevScores, JevError } from './jev.ts';

const input = {
  agenda: '次のリリースを決める',
  transcript: ['案Aがあります', '費用はどうですか', '確認しましょう'],
  secondsSinceLastIntervention: 60,
};

function reply(drifted, stalled, tangentIsRelevant, interveneNow) {
  return new Response(JSON.stringify({
    model: 'typesafe-ai/jev',
    answers: Object.fromEntries(Object.entries({ drifted, stalled, tangentIsRelevant, interveneNow })
      .map(([key, noul]) => [key, { type: 'noul', noul }])),
  }), { status: 200 });
}

test('sends agenda, conversation and four typed questions to the Gateway', async () => {
  let request;
  const result = await requestJevScores(input, {
    apiKey: 'test-key',
    fetch: async (url, options) => {
      request = { url, options };
      return reply(0.8, 0.1, 0.2, 0.9);
    },
  });
  assert.equal(request.url, 'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'typesafe-ai/jev');
  assert.deepEqual(body.state, { agenda: input.agenda, conversation: input.transcript });
  assert.deepEqual(Object.keys(body.questions), ['drifted', 'stalled', 'tangentIsRelevant', 'interveneNow']);
  assert.equal(result.scores.drifted, 0.8);
  assert.equal(result.scores.interveneNow, 0.9);
  assert.ok(result.latencyMs >= 0);
});

test('stays quiet for progress and a useful detour, waits when uncertain', () => {
  assert.equal(decideFromScores({ drifted: 0.1, stalled: 0.1, tangentIsRelevant: 0.9, interveneNow: 0.1 }).action, 'SILENCE');
  assert.equal(decideFromScores({ drifted: 0.8, stalled: 0.1, tangentIsRelevant: 0.9, interveneNow: 0.9 }).action, 'WAIT');
  assert.equal(decideFromScores({ drifted: 0.5, stalled: 0.2, tangentIsRelevant: 0.1, interveneNow: 0.5 }).action, 'WAIT');
  assert.equal(decideFromScores({ drifted: 0.8, stalled: 0.1, tangentIsRelevant: 0.1, interveneNow: 0.9 }).action, 'INTERVENE');
  assert.equal(decideFromScores({ drifted: 0.1, stalled: 0.8, tangentIsRelevant: 0.8, interveneNow: 0.9 }).action, 'INTERVENE');
  assert.equal(decideFromScores({ drifted: 0.9, stalled: 0.1, tangentIsRelevant: 0.1, interveneNow: 0.2 }).action, 'WAIT');
  assert.equal(decideFromScores({ drifted: 0.1, stalled: 0.9, tangentIsRelevant: 0.1, interveneNow: 0.2 }).action, 'WAIT');
});

test('rejects malformed scores and classifies rate limiting', async () => {
  await assert.rejects(
    requestJevScores(input, { apiKey: 'test-key', fetch: async () => reply(1.2, 0.1, 0.1, 0.9) }),
    error => error instanceof JevError && error.kind === 'invalid_response',
  );
  await assert.rejects(
    requestJevScores(input, { apiKey: 'test-key', fetch: async () => new Response('', { status: 429 }) }),
    error => error instanceof JevError && error.kind === 'rate_limit',
  );
});

test('rejects a response missing intervention-worthiness rather than defaulting to action', async () => {
  await assert.rejects(
    requestJevScores(input, { apiKey: 'test-key', fetch: async () => reply(0.9, 0.1, 0.1, undefined) }),
    error => error instanceof JevError && error.kind === 'invalid_response',
  );
});
