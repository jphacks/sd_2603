import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertStreamingRuntime } from './runtime.mjs';

test('worker rejects unsupported Node before starting paid audio streaming', () => {
  assert.throws(() => assertStreamingRuntime({ nodeVersion: '20.17.0', webSocket: undefined }), /Node.js 22\+/);
  assert.throws(() => assertStreamingRuntime({ nodeVersion: '24.0.0', webSocket: null }), /global WebSocket/);
});

test('supported streaming runtimes expose a WebSocket constructor', () => {
  for (const nodeVersion of ['22.23.1', '24.0.0']) {
    assert.doesNotThrow(() => assertStreamingRuntime({ nodeVersion, webSocket: class WebSocket {} }));
  }
});
