// Offline browser fixture only; never imported by the application or CI deployment.
const upstream = globalThis.fetch;
if (!process.env.TEST_RECALL_ORIGIN?.startsWith('http://127.0.0.1:')) throw new Error('A loopback Recall fixture is required');
globalThis.fetch = (input, options) => {
  if (typeof input === 'string' && /^https:\/\/[a-z0-9-]+\.recall\.ai\/api\/v1\//.test(input)) {
    const url = new URL(input);
    return upstream(process.env.TEST_RECALL_ORIGIN + url.pathname + url.search, options);
  }
  return upstream(input, options);
};
