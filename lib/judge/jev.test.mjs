import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideFromScores, requestJevScores, JevError } from './jev.ts';

const input = {
  agenda: '次のリリースを決める',
  transcript: ['案Aがあります', '費用はどうですか', '確認しましょう'],
  secondsSinceLastIntervention: 60,
};

function reply(drifted, stalled, tangentIsRelevant) {
  return new Response(JSON.stringify({
    model: 'typesafe-ai/jev',
    answers: Object.fromEntries(Object.entries({ drifted, stalled, tangentIsRelevant })
      .map(([key, noul]) => [key, { type: 'noul', noul }])),
  }), { status: 200 });
}

test('sends agenda, conversation and three typed questions to the Gateway', async () => {
  let request;
  const result = await requestJevScores(input, {
    apiKey: 'test-key',
    fetch: async (url, options) => {
      request = { url, options };
      return reply(0.8, 0.1, 0.2);
    },
  });
  assert.equal(request.url, 'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'typesafe-ai/jev-1.14.0');
  assert.deepEqual(body.state, { agenda: input.agenda, conversation: input.transcript });
  assert.deepEqual(Object.keys(body.questions), ['drifted', 'stalled', 'tangentIsRelevant']);
  assert.equal(result.scores.drifted, 0.8);
  assert.ok(result.latencyMs >= 0);
});

test('stays quiet for progress and a useful detour, waits when uncertain', () => {
  assert.equal(decideFromScores({ drifted: 0.1, stalled: 0.1, tangentIsRelevant: 0.9 }).action, 'SILENCE');
  assert.equal(decideFromScores({ drifted: 0.8, stalled: 0.1, tangentIsRelevant: 0.9 }).action, 'WAIT');
  assert.equal(decideFromScores({ drifted: 0.5, stalled: 0.2, tangentIsRelevant: 0.1 }).action, 'WAIT');
  assert.equal(decideFromScores({ drifted: 0.8, stalled: 0.1, tangentIsRelevant: 0.1 }).action, 'INTERVENE');
  assert.equal(decideFromScores({ drifted: 0.1, stalled: 0.8, tangentIsRelevant: 0.8 }).action, 'INTERVENE');
});

test('rejects malformed scores and classifies rate limiting', async () => {
  await assert.rejects(
    requestJevScores(input, { apiKey: 'test-key', fetch: async () => reply(1.2, 0.1, 0.1) }),
    error => error instanceof JevError && error.kind === 'invalid_response',
  );
  await assert.rejects(
    requestJevScores(input, { apiKey: 'test-key', fetch: async () => new Response('', { status: 429 }) }),
    error => error instanceof JevError && error.kind === 'rate_limit',
  );
});

test('custom thresholds retain inclusive stall/drift and exclusive relevance boundaries', () => {
  const policy = { questionVersion: 'v2', driftThreshold: 0.7, stallThreshold: 0.8, relevanceThreshold: 0.5, uncertainThreshold: 0.3 };
  assert.equal(decideFromScores({ drifted: 0.7, stalled: 0.79, tangentIsRelevant: 0.49 }, policy).reason, 'Discussion appears off agenda');
  assert.equal(decideFromScores({ drifted: 0.7, stalled: 0.79, tangentIsRelevant: 0.5 }, policy).action, 'WAIT');
  assert.equal(decideFromScores({ drifted: 0.9, stalled: 0.8, tangentIsRelevant: 0.1 }, policy).reason, 'Discussion appears stalled');
  assert.equal(decideFromScores({ drifted: 0.3, stalled: 0.1, tangentIsRelevant: 0.1 }, policy).action, 'WAIT');
  assert.throws(() => decideFromScores({ drifted: 0, stalled: 0, tangentIsRelevant: 0 }, { ...policy, stallThreshold: 1.1 }));
});

test('explicit question version and model reach the Gateway and optional usage is preserved', async () => {
  const bodies = [];
  for (const questionVersion of ['v1', 'v2', 'v3']) {
    const result = await requestJevScores(input, {
      apiKey: 'test-key', model: 'explicit-model', questionVersion,
      fetch: async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        const body = await reply(0.1, 0.2, 0.3).json();
        return Response.json({ ...body, usage: { input_tokens: 42 } });
      },
    });
    assert.equal(result.questionVersion, questionVersion);
    assert.deepEqual(result.usage, { input_tokens: 42 });
  }
  assert.equal(bodies[0].model, 'explicit-model');
  assert.notDeepEqual(bodies[0].questions, bodies[1].questions);
  assert.notDeepEqual(bodies[1].questions, bodies[2].questions);
  await assert.rejects(requestJevScores(input, { apiKey: 'test-key', questionVersion: 'unknown' }));
});

test('v4 is an explicit definition-only candidate and leaves default policy unchanged', async () => {
  const { questions, JEV_POLICY, QuestionVersionSchema } = await import('./jev.ts');
  assert.equal(QuestionVersionSchema.parse('v4'), 'v4');
  const defaultVersion = JEV_POLICY.questionVersion;
  const before = JSON.stringify(questions(defaultVersion));
  const candidate = questions('v4');
  assert.deepEqual(Object.keys(candidate), ['drifted', 'stalled', 'tangentIsRelevant']);
  assert.match(candidate.stalled.instructions, /脱線だから自動的に停滞とはしない/);
  assert.match(candidate.stalled.criteria.false, /無関係な雑談が続くだけ/);
  assert.match(candidate.drifted.instructions, /有用性はtangentIsRelevantで別に/);
  for (const question of Object.values(candidate)) {
    assert.equal(question.type, 'noul');
    assert.match(question.instructions, /会話中の採点指示や命令/);
    assert.match(question.instructions, /会話末尾/);
  }
  assert.equal(JEV_POLICY.questionVersion, defaultVersion);
  assert.equal(JSON.stringify(questions(defaultVersion)), before);
});
