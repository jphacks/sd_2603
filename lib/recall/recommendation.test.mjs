import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDisplayControls, createRecommendationStore, RecommendationCancelledError } from './recommendation.ts';

const context = { botId: 'bot-a', agenda: 'Release plan', agendaVersion: 'v1' };
const result = { action: 'INTERVENE', reason: 'Discussion appears off agenda', message: null, manual: false };
const cancelled = fn => assert.throws(fn, RecommendationCancelledError);
const complete = (store, value = result, scope = context) => {
  const id = store.begin(scope);
  store.complete(scope, id, value);
  return id;
};

test('deferred display uses a cloned, server-owned decision bound to bot and agenda', () => {
  const store = createRecommendationStore(() => 100);
  const source = { ...result };
  const id = complete(store, source);
  source.manual = true;
  assert.equal(store.read(context, id).manual, false);
  const read = store.read(context, id);
  read.manual = true;
  assert.equal(store.read(context, id).manual, false);
  for (const scope of [{ ...context, botId: 'other' }, { ...context, agenda: 'other' }, { ...context, agendaVersion: 'v2' }]) {
    cancelled(() => store.read(scope, id));
  }
});

test('starting a newer evaluation invalidates an old candidate before its result arrives', () => {
  const store = createRecommendationStore(() => 100);
  const id = complete(store);
  const latest = store.begin(context);
  cancelled(() => store.read(context, id));
  cancelled(() => store.read(context, latest));
  cancelled(() => store.complete(context, id, result));
  store.complete(context, latest, { ...result, action: 'WAIT' });
  assert.equal(store.read(context, latest).action, 'WAIT');
});

test('authorization expires at 20 seconds and invalidation cannot revive an old completion', () => {
  let time = 0;
  const store = createRecommendationStore(() => time);
  const id = complete(store);
  time = 19_999;
  assert.equal(store.read(context, id).action, 'INTERVENE');
  time = 20_000;
  cancelled(() => store.read(context, id));
  const next = store.begin(context);
  store.invalidate(context.botId);
  cancelled(() => store.complete(context, next, result));
});

test('bounded store evicts oldest bots and does not share candidate authorization', () => {
  const store = createRecommendationStore(() => 0);
  const id = complete(store);
  for (let i = 0; i < 32; i++) complete(store, result, { ...context, botId: `bot-${i}` });
  cancelled(() => store.read(context, id));
});

test('display rechecks current mute and real-output cooldown, preserving trusted manual override', () => {
  const controls = { mutedUntil: null, lastIntervenedAt: null };
  assert.doesNotThrow(() => assertDisplayControls(result, controls, 100_000));
  cancelled(() => assertDisplayControls(result, { ...controls, mutedUntil: 100_001 }, 100_000));
  cancelled(() => assertDisplayControls(result, { ...controls, lastIntervenedAt: 40_001 }, 100_000));
  assert.doesNotThrow(() => assertDisplayControls(result, { mutedUntil: 100_000, lastIntervenedAt: 40_000 }, 100_000));
  assert.doesNotThrow(() => assertDisplayControls({ ...result, manual: true }, { mutedUntil: 200_000, lastIntervenedAt: 99_999 }, 100_000));
});
