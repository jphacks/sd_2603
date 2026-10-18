// Replace only the Gateway transport; the worker's Recall websocket stays real.
const localFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('External HTTP disabled in worker integration test');
  return localFetch(input, options);
};

const transcripts = JSON.parse(process.env.TEST_GATEWAY_TRANSCRIPTS ?? '["synthetic transcript"]');
let opened = 0;

globalThis.WebSocket = class FakeGatewayWebSocket {
  static OPEN = 1;
  OPEN = 1;
  readyState = 0;
  bufferedAmount = 0;

  constructor(url) {
    if (new URL(url).hostname !== 'ai-gateway.vercel.sh') throw new Error('Unexpected Gateway transport destination');
    this.text = transcripts[opened++] ?? 'synthetic transcript';
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({ target: this }); });
  }

  send(value) {
    if (typeof value !== 'string') return;
    const frame = JSON.parse(value);
    if (frame.type !== 'transcription-stream.audio-done') return;
    queueMicrotask(() => {
      this.onmessage?.({ data: JSON.stringify({ type: 'transcript-final', text: this.text }) });
      this.onmessage?.({ data: JSON.stringify({ type: 'finish', text: this.text, segments: [] }) });
    });
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code, reason }));
  }
};
