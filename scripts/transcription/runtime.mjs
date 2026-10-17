export function assertStreamingRuntime({ nodeVersion = process.versions.node, webSocket = globalThis.WebSocket } = {}) {
  if (Number(nodeVersion.split('.')[0]) < 22 || typeof webSocket !== 'function') {
    throw new Error('Streaming transcription requires Node.js 22+ with global WebSocket; use the Node.js version specified in package.json.');
  }
}
