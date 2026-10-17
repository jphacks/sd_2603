import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { run } from './recall.mjs';

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
      fetch: async (url, options) => {
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

function exists(file) {
  try {
    readFileSync(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
