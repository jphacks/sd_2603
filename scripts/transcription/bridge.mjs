import { timingSafeEqual } from 'node:crypto';

export function workerUrl(env, pathname) {
  const url = new URL(env.RECALL_AUDIO_WORKER_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Audio worker URL must be an HTTPS origin');
  if (!env.RECALL_AUDIO_TOKEN || env.RECALL_AUDIO_TOKEN.length < 32) throw new Error('Audio worker token missing');
  return new URL(pathname, url);
}

export async function workerRequest(env, pathname, body, fetchImpl = fetch) {
  const response = await fetchImpl(workerUrl(env, pathname), {
    method: 'POST', redirect: 'error', cache: 'no-store',
    headers: { Authorization: `Bearer ${env.RECALL_AUDIO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  return response;
}

export function createWorkerBridge({ token, controlToken, controlUrl, sessions, stopSession, getStatus, fetchImpl = fetch }) {
  return async (request, response) => {
    if (!['/sessions', '/sessions/stop', '/bridge', '/status', '/ready'].includes(request.url)) return false;
    const actual = Buffer.from(request.headers.authorization?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(token);
    const reply = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
    if (request.method !== 'POST' || actual.length !== expected.length || !timingSafeEqual(actual, expected)) { reply(401, { error: 'Unauthorized' }); return true; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > 2_000_000) { reply(413, { error: 'Too large' }); return true; }
        chunks.push(bytes);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reply(400, { error: 'Invalid JSON' }); return true; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) { reply(400, { error: 'Invalid body' }); return true; }
      if (request.url === '/ready') {
        const upstream = await fetchImpl(new URL('/api/recall/audio-ready', controlUrl), { headers: { Authorization: `Bearer ${controlToken}` }, redirect: 'error', signal: AbortSignal.timeout(3000) });
        reply(upstream.ok && sessions.size < 128 ? 200 : 503, { ready: upstream.ok && sessions.size < 128 }); return true;
      }
      if (request.url === '/sessions') {
        if (sessions.size >= 128 || sessions.has(body.id) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) || typeof body.agenda !== 'string' || !body.agenda.trim() || body.agenda.length > 500) { reply(409, { error: 'Worker busy or invalid session' }); return true; }
        sessions.set(body.id, { id: body.id, agenda: body.agenda.trim(), audioEnabled: true, createdAt: new Date().toISOString() });
        reply(200, { registered: true }); return true;
      }
      const session = sessions.get(body.botId);
      if (!session) { reply(404, { error: 'Unknown session' }); return true; }
      if (request.url === '/sessions/stop') { stopSession(session.id); sessions.delete(session.id); reply(200, { stopped: true }); return true; }
      if (request.url === '/status') { reply(200, getStatus(session.id)); return true; }
      // Fixed local paths only: no caller-controlled destination, cookies or credentials.
      const allowed = ['/api/recall/video', '/api/recall/materials', '/api/recall/chat', `/api/monitor/${session.id}`];
      if (!allowed.includes(body.path)) { reply(400, { error: 'Unsupported path' }); return true; }
      if (body.path === '/api/recall/video' && body.body?.botId !== session.id) { reply(400, { error: 'Wrong bot' }); return true; }
      let payload;
      const headers = { Authorization: `Bearer ${controlToken}` };
      if (body.path === '/api/recall/materials') {
        const form = new FormData(); form.set('botId', session.id);
        if (!Array.isArray(body.files) || body.files.length > 5) { reply(400, { error: 'Invalid files' }); return true; }
        for (const file of body.files) form.append('files', new Blob([Buffer.from(file.base64, 'base64')]), String(file.name).slice(0, 200));
        payload = form;
      } else if (body.path === '/api/recall/chat') {
        if (JSON.parse(body.payload).data?.bot?.id !== session.id) { reply(400, { error: 'Wrong bot' }); return true; }
        payload = body.payload;
        for (const key of ['webhook-id', 'webhook-timestamp', 'webhook-signature', 'svix-id', 'svix-timestamp', 'svix-signature']) if (body.headers?.[key]) headers[key] = body.headers[key];
        headers['Content-Type'] = 'application/json';
      } else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body.body); }
      const method = body.path.startsWith('/api/monitor/') ? 'GET' : 'POST';
      const upstream = await fetchImpl(new URL(body.path, controlUrl), {
        method, redirect: 'error', headers, ...(method === 'POST' ? { body: payload } : {}), signal: AbortSignal.timeout(20000),
      });
      reply(upstream.status, await upstream.json());
    } catch { reply(502, { error: 'Audio bridge unavailable' }); }
    return true;
  };
}
