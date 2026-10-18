import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertStreamingRuntime } from './runtime.mjs';

test('worker rejects unsupported Node before starting paid audio streaming', () => {
  for (const nodeVersion of ['20.17.0', '22.23.1', '25.0.0', 'invalid']) {
    assert.throws(() => assertStreamingRuntime({ nodeVersion, webSocket: class WebSocket {} }), /Node.js 24\.x/);
  }
  assert.throws(() => assertStreamingRuntime({ nodeVersion: '24.0.0', webSocket: null }), /global WebSocket/);
});

test('supported streaming runtimes expose a WebSocket constructor', () => {
  for (const nodeVersion of ['24.0.0', '24.22.0']) {
    assert.doesNotThrow(() => assertStreamingRuntime({ nodeVersion, webSocket: class WebSocket {} }));
  }
});
