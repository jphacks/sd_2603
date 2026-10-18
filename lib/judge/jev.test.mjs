import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideFromScores, jevJudge, requestJevScores, JevError } from './jev.ts';
import { resolvesIntervention } from './resolution.ts';

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

test('with a card up, two finals are judged so a return shows, but never put up a new card', async () => {
  const saved = { fetch: globalThis.fetch, key: process.env.AI_GATEWAY_API_KEY };
  let scores = [0.1, 0.1, 0.2, 0.1];
  let calls = 0;
  process.env.AI_GATEWAY_API_KEY = 'test-key';
  globalThis.fetch = async () => { calls++; return reply(...scores); };
  try {
    const two = { ...input, transcript: input.transcript.slice(0, 2), secondsSinceLastIntervention: 90 };
    assert.equal((await jevJudge(two)).reason, 'Not enough conversation');
    assert.equal(calls, 0, 'without a card up, three finals are still needed');
    assert.equal((await jevJudge({ ...two, transcript: ['案Aがあります'], holding: true })).reason, 'Not enough conversation');
    assert.equal(calls, 0);
    assert.equal(resolvesIntervention(await jevJudge({ ...two, holding: true })), true, 'back on track after two finals');
    scores = [0.9, 0.1, 0.1, 0.9];
    const still = await jevJudge({ ...two, holding: true });
    assert.deepEqual([still.action, still.reason, resolvesIntervention(still)], ['WAIT', 'Not enough conversation', false]);
    assert.equal((await jevJudge({ ...input, holding: true })).action, 'INTERVENE', 'three finals may still put up a card');
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = saved.key;
  }
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
