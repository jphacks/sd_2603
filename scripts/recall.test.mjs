import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { run, removeBot, sendBot, localRecallIo } from './recall.mjs';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'recall-cli-'));
  return {
    dir,
    statePath: path.join(dir, 'current.json'),
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function capture(extra = {}) {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    io: {
      statePath: extra.statePath,
      env: { RECALL_API_KEY: 'secret-key', RECALL_REGION: 'ap-northeast-1', ...extra.env },
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      fetch: extra.fetch,
      sleep: extra.sleep ?? (async () => {}),
      now: extra.now ?? (() => 1_000),
      joinTimeoutMs: extra.joinTimeoutMs ?? 540_000,
      leaveTimeoutMs: extra.leaveTimeoutMs ?? 60_000,
      pollMs: extra.pollMs ?? 3_000,
      installSignals: extra.installSignals ?? false,
    },
  };
}

test('unknown flags and a non-https URL exit 2', async () => {
  const unknown = capture();
  assert.equal(await run(['join', '--bot'], unknown.io), 2);
  assert.match(unknown.stderr.join('\n'), /未知のフラグです/);

  const url = capture();
  assert.equal(await run(['join', '--url', 'http://meet.google.com/abc'], url.io), 2);
  assert.match(url.stderr.join('\n'), /https:\/\//);
});

test('status and leave without a bot exit 1', async () => {
  const box = fixture();
  try {
    const status = capture({ statePath: box.statePath });
    assert.equal(await run(['status'], status.io), 1);
    const leave = capture({ statePath: box.statePath });
    assert.equal(await run(['leave'], leave.io), 1);
  } finally {
    box.cleanup();
  }
});

test('join waits until the bot is in the call and stores its id', async () => {
  const box = fixture();
  const posts = [];
  try {
    const cap = capture({
      statePath: box.statePath,
      fetch: async (url, options) => {
        if (options?.method === 'POST') {
          posts.push(JSON.parse(options.body));
          assert.equal(options.headers.Authorization, 'Token secret-key');
          return jsonResponse(200, { id: 'bot-1' });
        }
        return jsonResponse(200, {
          status_changes: [
            { code: 'joining_call', created_at: '2026-10-17T00:00:00Z' },
            { code: 'in_call_not_recording', created_at: '2026-10-17T00:00:02Z' },
          ],
        });
      },
    });
    assert.equal(
      await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io),
      0,
    );
    assert.equal(posts.length, 1);
    assert.equal(posts[0].recording_config, null);
    assert.equal(posts[0].bot_name, 'MTG Lab');
    assert.equal(posts[0].join_at, undefined);
    const state = JSON.parse(readFileSync(box.statePath, 'utf8'));
    assert.equal(state.id, 'bot-1');
    assert.match(cap.stdout.join('\n'), /入室しました \(in_call_not_recording\)/);
    assert.equal(`${cap.stdout.join('\n')}\n${cap.stderr.join('\n')}`.includes('secret-key'), false);
  } finally {
    box.cleanup();
  }
});

test('join replaces a bot whose media has expired', async () => {
  const box = fixture();
  mkdirSync(box.dir, { recursive: true });
  writeFileSync(box.statePath, JSON.stringify({ id: 'bot-old', region: 'ap-northeast-1' }));
  const posts = [];
  try {
    const cap = capture({
      statePath: box.statePath,
      fetch: async (url, options) => {
        if (options?.method === 'POST' && String(url).endsWith('/bot/')) {
          posts.push(JSON.parse(options.body));
          return jsonResponse(200, { id: 'bot-new' });
        }
        if (String(url).endsWith('/bot/bot-old/')) {
          return jsonResponse(200, {
            status_changes: [{ code: 'media_expired', created_at: '2026-10-17T00:00:00Z' }],
          });
        }
        return jsonResponse(200, {
          status_changes: [{ code: 'in_call_not_recording', created_at: '2026-10-17T00:00:02Z' }],
        });
      },
    });
    assert.equal(await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io), 0);
    assert.equal(posts.length, 1);
    assert.equal(JSON.parse(readFileSync(box.statePath, 'utf8')).id, 'bot-new');
    assert.equal(cap.stderr.join('\n').includes('leave を試してください'), false);
  } finally {
    box.cleanup();
  }
});

test('join refuses while a bot is still in the call', async () => {
  const box = fixture();
  mkdirSync(box.dir, { recursive: true });
  writeFileSync(
    box.statePath,
    JSON.stringify({ id: 'bot-live', region: 'ap-northeast-1', meetingUrl: 'https://meet.google.com/a', createdAt: 't' }),
  );
  let posts = 0;
  try {
    const cap = capture({
      statePath: box.statePath,
      fetch: async (url, options) => {
        if (options?.method === 'POST') posts += 1;
        return jsonResponse(200, {
          status_changes: [{ code: 'in_waiting_room', created_at: '2026-10-17T00:00:00Z' }],
        });
      },
    });
    assert.equal(await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io), 1);
    assert.equal(posts, 0);
    assert.match(cap.stderr.join('\n'), /すでにボットが会議にいます/);
  } finally {
    box.cleanup();
  }
});

test('waiting for admission times out with a host message', async () => {
  const box = fixture();
  let clock = 0;
  try {
    const cap = capture({
      statePath: box.statePath,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      joinTimeoutMs: 10,
      pollMs: 20,
      fetch: async (url, options) => {
        if (options?.method === 'POST') return jsonResponse(200, { id: 'bot-wait' });
        return jsonResponse(200, {
          status_changes: [{ code: 'in_waiting_room', created_at: '2026-10-17T00:00:01Z' }],
        });
      },
    });
    assert.equal(await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io), 1);
    assert.match(cap.stdout.join('\n'), /参加を許可してください/);
    assert.match(cap.stderr.join('\n'), /timeout_exceeded_waiting_room/);
  } finally {
    box.cleanup();
  }
});

test('a sign-in failure is reported and not retried', async () => {
  const box = fixture();
  let posts = 0;
  try {
    const cap = capture({
      statePath: box.statePath,
      fetch: async (url, options) => {
        if (options?.method === 'POST') {
          posts += 1;
          return jsonResponse(200, { id: 'bot-sign' });
        }
        return jsonResponse(200, {
          status_changes: [{
            code: 'fatal',
            sub_code: 'meeting_requires_sign_in',
            message: 'sign in required',
            created_at: '2026-10-17T00:00:01Z',
          }],
        });
      },
    });
    assert.equal(await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io), 1);
    assert.equal(posts, 1);
    assert.match(cap.stderr.join('\n'), /再送しない/);
  } finally {
    box.cleanup();
  }
});

test('leave removes the bot and deletes the state file', async () => {
  const box = fixture();
  mkdirSync(box.dir, { recursive: true });
  writeFileSync(box.statePath, JSON.stringify({ id: 'bot-1', region: 'ap-northeast-1' }));
  try {
    const cap = capture({
      statePath: box.statePath,
      fetch: async (url) => {
        if (String(url).endsWith('/leave_call/')) return jsonResponse(200, {});
        return jsonResponse(200, {
          status_changes: [
            { code: 'in_call_not_recording', created_at: '2026-10-17T00:00:00Z' },
            { code: 'call_ended', created_at: '2026-10-17T00:00:03Z' },
          ],
        });
      },
    });
    assert.equal(await run(['leave'], cap.io), 0);
    assert.equal(exists(box.statePath), false);
    assert.match(cap.stdout.join('\n'), /退出しました \(call_ended\)/);
  } finally {
    box.cleanup();
  }
});

test('an already-left bot is treated as success', async () => {
  const box = fixture();
  mkdirSync(box.dir, { recursive: true });
  writeFileSync(box.statePath, JSON.stringify({ id: 'bot-1' }));
  try {
    const cap = capture({
      statePath: box.statePath,
      fetch: async () => jsonResponse(400, {}),
    });
    assert.equal(await run(['leave'], cap.io), 0);
    assert.match(cap.stdout.join('\n'), /すでに退出しています/);
    assert.equal(exists(box.statePath), false);
  } finally {
    box.cleanup();
  }
});

test('Ctrl+C during join requests leave once', async () => {
  const box = fixture();
  let leaves = 0;
  try {
    const cap = capture({
      statePath: box.statePath,
      installSignals: true,
      sleep: async () => {
        process.emit('SIGINT');
      },
      fetch: async (url, options) => {
        if (options?.method === 'POST' && String(url).endsWith('/bot/')) {
          return jsonResponse(200, { id: 'bot-int' });
        }
        if (String(url).endsWith('/leave_call/')) {
          leaves += 1;
          return jsonResponse(200, {});
        }
        return jsonResponse(200, {
          status_changes: [{ code: 'joining_call', created_at: '2026-10-17T00:00:00Z' }],
        });
      },
    });
    assert.equal(await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io), 0);
    assert.equal(leaves, 1);
    assert.match(cap.stderr.join('\n'), /SIGINT/);
    assert.match(cap.stdout.join('\n'), /退出を要求しました bot-int/);
  } finally {
    box.cleanup();
  }
});

test('sendBot creates one silent bot and does not wait for admission', async () => {
  const box = fixture();
  const calls = [];
  try {
    const io = capture({
      statePath: box.statePath,
      fetch: async (url, options) => {
        calls.push({ url, method: options?.method ?? 'GET' });
        if (options?.method === 'POST') return jsonResponse(200, { id: 'bot-sent' });
        return jsonResponse(200, { status_changes: [] });
      },
    }).io;
    const sent = await sendBot('https://meet.google.com/abc-defg-hij', io);
    assert.deepEqual(sent, {
      id: 'bot-sent',
      region: 'ap-northeast-1',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/bot\/$/);
    const state = JSON.parse(readFileSync(box.statePath, 'utf8'));
    assert.equal(state.id, 'bot-sent');
    await assert.rejects(
      () => sendBot('http://meet.google.com/abc', io),
      (error) => error.status === 400,
    );
  } finally {
    box.cleanup();
  }
});

test('removeBot treats media_expired as left', async () => {
  const box = fixture();
  mkdirSync(box.dir, { recursive: true });
  writeFileSync(box.statePath, JSON.stringify({ id: 'bot-1' }));
  try {
    const io = capture({
      statePath: box.statePath,
      fetch: async (url) => {
        if (String(url).endsWith('/leave_call/')) return jsonResponse(200, {});
        return jsonResponse(200, {
          status_changes: [{ code: 'media_expired', created_at: '2026-10-17T00:00:03Z' }],
        });
      },
    }).io;
    const result = await removeBot(io, 'bot-1');
    assert.equal(result.left, true);
    assert.equal(result.code, 'media_expired');
    assert.equal(exists(box.statePath), false);
  } finally {
    box.cleanup();
  }
});

test('removeBot asks the bot to leave and deletes the state file', async () => {
  const box = fixture();
  mkdirSync(box.dir, { recursive: true });
  writeFileSync(box.statePath, JSON.stringify({ id: 'bot-1' }));
  try {
    const io = capture({
      statePath: box.statePath,
      fetch: async (url) => {
        if (String(url).endsWith('/leave_call/')) return jsonResponse(200, {});
        return jsonResponse(200, {
          status_changes: [{ code: 'call_ended', created_at: '2026-10-17T00:00:03Z' }],
        });
      },
    }).io;
    const result = await removeBot(io, 'bot-1');
    assert.equal(result.left, true);
    assert.equal(result.code, 'call_ended');
    assert.equal(exists(box.statePath), false);
  } finally {
    box.cleanup();
  }
});

test('join keeps recording disabled unless a chat webhook URL is configured', async () => {
  const box = fixture();
  const posts = [];
  try {
    const cap = capture({
      statePath: box.statePath,
      env: { RECALL_CHAT_WEBHOOK_URL: 'https://demo.example/api/recall/chat' },
      fetch: async (url, options) => {
        if (options?.method === 'POST') {
          posts.push(JSON.parse(options.body));
          return jsonResponse(200, { id: 'bot-chat' });
        }
        return jsonResponse(200, {
          status_changes: [{ code: 'in_call_not_recording', created_at: '2026-10-17T00:00:02Z' }],
        });
      },
    });
    assert.equal(await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io), 0);
    assert.equal(posts[0].recording_config.retention, null);
    assert.deepEqual(posts[0].recording_config.participant_events, {});
    assert.deepEqual(posts[0].recording_config.realtime_endpoints, [{
      type: 'webhook',
      url: 'https://demo.example/api/recall/chat',
      events: ['participant_events.chat_message'],
    }]);
    assert.equal(posts[0].chat.on_bot_join.send_to, 'everyone');
    assert.equal(posts[0].chat.on_bot_join.pin, true);
    assert.match(posts[0].chat.on_bot_join.message, /アジェンダ:/);
  } finally {
    box.cleanup();
  }
});

test('join rejects a chat webhook URL that is not https', async () => {
  const box = fixture();
  let posts = 0;
  try {
    const cap = capture({
      statePath: box.statePath,
      env: { RECALL_CHAT_WEBHOOK_URL: 'http://demo.example/api/recall/chat' },
      fetch: async () => {
        posts += 1;
        return jsonResponse(200, { id: 'bot-chat' });
      },
    });
    assert.equal(await run(['join', '--url', 'https://meet.google.com/abc-defg-hij'], cap.io), 2);
    assert.equal(posts, 0);
    assert.match(cap.stderr.join('\n'), /RECALL_CHAT_WEBHOOK_URL/);
  } finally {
    box.cleanup();
  }
});

function exists(file) {
  try {
    readFileSync(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

for (const withChat of [false, true]) test(`audio opt-in uses one UI-owned bot with explicit agenda${withChat ? ' and chat webhook' : ''}`, async () => {
  const box = fixture();
  const requests = [];
  try {
    const cap = capture({
      statePath: box.statePath,
      env: {
        ENABLE_REALTIME_TRANSCRIPTION: 'true', AI_PROVIDER: 'jev', ALLOW_PAID_AI: 'true', AI_GATEWAY_API_KEY: 'test-only',
        RECALL_CONTROL_TOKEN: 'c'.repeat(40), RECALL_AUDIO_TOKEN: 'a'.repeat(40),
        RECALL_AUDIO_PUBLIC_URL: 'wss://example.test', RECALL_AUDIO_PORT: '8787',
        ...(withChat ? { RECALL_CHAT_WEBHOOK_URL: 'https://example.test/api/recall/chat' } : {}),
      },
      fetch: async (url, options) => {
        requests.push({ url: String(url), options });
        if (String(url).endsWith('/health')) return { ok: true };
        return jsonResponse(200, { id: 'bot-audio' });
      },
    });
    const sent = await sendBot('https://meet.google.com/abc-defg-hij', cap.io, 'Release plan');
    assert.equal(sent.id, 'bot-audio');
    assert.equal(requests.length, 2);
    const body = JSON.parse(requests[1].options.body);
    assert.deepEqual(body.recording_config.realtime_endpoints[0].events, ['audio_mixed_raw.data']);
    assert.equal(body.recording_config.audio_mixed_raw !== undefined, true);
    assert.equal(body.recording_config.realtime_endpoints.length, withChat ? 2 : 1);
    if (withChat) {
      assert.deepEqual(body.recording_config.realtime_endpoints[1], {
        type: 'webhook', url: 'https://example.test/api/recall/chat', events: ['participant_events.chat_message'],
      });
      assert.equal(body.recording_config.retention, null);
      assert.equal(body.chat.on_bot_join.pin, true);
    }
    const state = JSON.parse(readFileSync(box.statePath, 'utf8'));
    assert.equal(state.agenda, 'Release plan');
  } finally { box.cleanup(); }
});

test('audio mode fails before creating a bot when worker is unavailable', async () => {
  const box = fixture();
  let botPosts = 0;
  try {
    const cap = capture({
      statePath: box.statePath,
      env: {
        ENABLE_REALTIME_TRANSCRIPTION: 'true', AI_PROVIDER: 'jev', ALLOW_PAID_AI: 'true', AI_GATEWAY_API_KEY: 'test-only',
        RECALL_CONTROL_TOKEN: 'c'.repeat(40), RECALL_AUDIO_TOKEN: 'a'.repeat(40),
        RECALL_AUDIO_PUBLIC_URL: 'wss://example.test',
      },
      fetch: async (url) => { if (String(url).includes('/bot/')) botPosts++; throw new Error('Worker offline'); },
    });
    await assert.rejects(sendBot('https://meet.google.com/abc-defg-hij', cap.io, 'Release plan'), error => error.status === 503);
    assert.equal(botPosts, 0);
  } finally { box.cleanup(); }
});


test('Vercel state uses writable temporary storage while local CLI keeps its existing path', () => {
  assert.equal(localRecallIo({ VERCEL: '1' }).statePath, path.join(tmpdir(), 'meeting-facilitator-recall', 'current.json'));
  assert.equal(path.basename(path.dirname(localRecallIo({}).statePath)), '.recall');
});

test('an unwritable state directory fails before any Recall request', async () => {
  const box = fixture();
  try {
    const blocked = path.join(box.dir, 'blocked');
    writeFileSync(blocked, 'not a directory');
    let calls = 0;
    const { io } = capture({ statePath: path.join(blocked, 'current.json'), fetch: async () => { calls++; throw new Error('Must not call Recall'); } });
    await assert.rejects(sendBot('https://meet.google.com/abc-defg-hij', io), error => error.status === 503 && /Botは作成していません/.test(error.message));
    assert.equal(calls, 0);
  } finally { box.cleanup(); }
});

test('a storage failure after creation requests leave for only the newly created bot', async () => {
  const box = fixture();
  try {
    const stateDir = path.join(box.dir, 'state');
    const calls = [];
    const { io } = capture({ statePath: path.join(stateDir, 'current.json'), fetch: async (url, options) => {
      calls.push([url, options.method]);
      if (url.endsWith('/bot/')) {
        rmSync(stateDir, { recursive: true, force: true });
        writeFileSync(stateDir, 'storage became unavailable');
        return jsonResponse(201, { id: 'new-bot-only' });
      }
      assert.ok(url.endsWith('/bot/new-bot-only/leave_call/'));
      return jsonResponse(200, {});
    } });
    await assert.rejects(sendBot('https://meet.google.com/abc-defg-hij', io), error => error.status === 503 && /退出を要求/.test(error.message));
    assert.equal(calls.length, 2);
    assert.equal(calls.filter(([url]) => url.endsWith('/bot/')).length, 1);
  } finally { box.cleanup(); }
});
