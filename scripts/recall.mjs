import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, '.recall', 'current.json');
const USAGE = `使い方:
  npm run recall -- join --url https://meet.google.com/abc-defg-hij
  npm run recall -- status
  npm run recall -- leave [--id <bot-uuid>]`;

const LIVE = new Set([
  'joining_call',
  'in_waiting_room',
  'in_call_not_recording',
  'in_call_recording',
]);
const JOIN_OK = new Set(['in_call_not_recording', 'in_call_recording']);
const JOIN_FAIL = new Set(['fatal', 'call_ended', 'done']);

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const positional = [];
  /** @type {{ url?: string, id?: string }} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' || arg === '--id') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        return { error: `${arg} には値が必要です` };
      }
      flags[arg.slice(2)] = value;
      i++;
      continue;
    }
    if (arg.startsWith('--')) return { error: `未知のフラグです: ${arg}` };
    positional.push(arg);
  }
  return { command: positional[0], extra: positional.slice(1), flags };
}

function regionOf(env) {
  return (env.RECALL_REGION || 'ap-northeast-1').trim();
}

function formatHttpError(status, body) {
  if (status === 401) {
    return '401: API キーと RECALL_REGION が同じリージョンか確認してください。';
  }
  if (status === 507) {
    return '507: アドホック枠が足りません。待って 1 回だけ再実行してください。';
  }
  const detail = body?.detail || body?.message || body?.error || '';
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
  return `Recall API ${status}${text ? `: ${text}` : ''}`;
}

function hintFor(change) {
  const sub = change?.sub_code;
  if (
    sub === 'meeting_requires_sign_in' ||
    sub === 'google_meet_sign_in_missing_login_credentials'
  ) {
    return 'サインイン済みボットが要る。このスライスでは再送しない';
  }
  if (
    sub === 'timeout_exceeded_waiting_room' ||
    sub === 'call_ended_by_platform_waiting_room_timeout'
  ) {
    return 'ホストが許可していない。timeout_exceeded_waiting_room';
  }
  if (sub === 'bot_kicked_from_call' || sub === 'bot_kicked_from_waiting_room') {
    return 'ホストが退出させた';
  }
  return '';
}

function sortedChanges(bot) {
  const changes = Array.isArray(bot?.status_changes) ? [...bot.status_changes] : [];
  changes.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return changes;
}

function formatChange(change) {
  const sub = change.sub_code ? `  ${change.sub_code}` : '';
  const message = change.message ? `  ${change.message}` : '';
  return `${change.created_at ?? ''}  ${change.code}${sub}${message}`.trim();
}

function latestChange(bot) {
  return sortedChanges(bot).at(-1) ?? null;
}

async function recallFetch(io, pathName, options = {}) {
  const key = String(io.env.RECALL_API_KEY || '').trim();
  if (!key) {
    const error = new Error('RECALL_API_KEY がありません。sd_2603/.env に入れてください。');
    error.status = 0;
    throw error;
  }
  const response = await io.fetch(`https://${regionOf(io.env)}.recall.ai/api/v1${pathName}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Token ${key}`,
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    const error = new Error(formatHttpError(response.status, body));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body ?? {};
}

async function readState(io) {
  try {
    const raw = await readFile(io.statePath, 'utf8');
    const state = JSON.parse(raw);
    if (!state?.id || typeof state.id !== 'string') {
      throw new Error('状態ファイルの id がありません');
    }
    return state;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new Error('状態ファイルを読めません。.recall/current.json を確認してください。');
    }
    throw error;
  }
}

async function writeState(io, state) {
  await mkdir(path.dirname(io.statePath), { recursive: true });
  await writeFile(io.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function clearState(io, id) {
  const state = await readState(io).catch(() => null);
  if (state?.id === id) await rm(io.statePath, { force: true });
}

function printChanges(io, changes, seen, waitingHint) {
  for (const change of changes) {
    const key = `${change.created_at}|${change.code}|${change.sub_code ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    io.stdout(formatChange(change));
    if (change.code === 'in_waiting_room' && !waitingHint.shown) {
      waitingHint.shown = true;
      io.stdout('Meet で MTG Lab の参加を許可してください');
    }
  }
}

function printFailure(io, change) {
  if (!change) return;
  const sub = change.sub_code ? ` ${change.sub_code}` : '';
  const message = change.message ? ` ${change.message}` : '';
  io.stderr(`失敗: ${change.code}${sub}${message}`.trim());
  const hint = hintFor(change);
  if (hint) io.stderr(hint);
}

async function poll(io, id, { timeoutMs, succeed, fail, signal }) {
  const seen = new Set();
  const waitingHint = { shown: false };
  const started = io.now();
  let latest = null;
  while (io.now() - started < timeoutMs) {
    if (signal?.aborted) return { aborted: true, latest };
    const bot = await recallFetch(io, `/bot/${id}/`);
    const changes = sortedChanges(bot);
    printChanges(io, changes, seen, waitingHint);
    latest = changes.at(-1) ?? null;
    if (signal?.aborted) return { aborted: true, latest };
    if (latest && succeed(latest)) return { ok: true, latest };
    if (latest && fail(latest)) return { ok: false, latest };
    await io.sleep(io.pollMs);
    if (signal?.aborted) return { aborted: true, latest };
  }
  return { ok: false, timeout: true, latest };
}

export class RecallCliError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, exitCode?: number }} [detail]
   */
  constructor(message, detail = {}) {
    super(message);
    this.name = 'RecallCliError';
    this.status = detail.status ?? 400;
    this.exitCode = detail.exitCode ?? 1;
  }
}

export async function sendBot(meetingUrl, io) {
  if (!/^https:\/\/.+/i.test(String(meetingUrl ?? ''))) {
    throw new RecallCliError('会議 URL は https:// で始めてください。', { status: 400, exitCode: 2 });
  }

  const existing = await readState(io);
  if (existing) {
    try {
      const bot = await recallFetch(io, `/bot/${existing.id}/`);
      const code = latestChange(bot)?.code ?? 'unknown';
      if (LIVE.has(code)) {
        throw new RecallCliError(
          `すでにボットが会議にいます (${existing.id}, ${code})。leave してから再実行してください。`,
          { status: 409 },
        );
      }
      if (code === 'done' || code === 'fatal' || code === 'call_ended') {
        await clearState(io, existing.id);
      } else {
        throw new RecallCliError(
          `状態 ${code} のボットが残っています (${existing.id})。leave を試してください。`,
          { status: 409 },
        );
      }
    } catch (error) {
      if (error instanceof RecallCliError) throw error;
      if (error.status !== 404) throw error;
      await clearState(io, existing.id);
    }
  }

  const created = await recallFetch(io, '/bot/', {
    method: 'POST',
    body: {
      meeting_url: meetingUrl,
      bot_name: 'MTG Lab',
      recording_config: null,
      automatic_leave: {
        waiting_room_timeout: 540,
        noone_joined_timeout: 300,
      },
    },
  });
  const botId = created.id;
  if (!botId) throw new RecallCliError('bot id が返りませんでした', { status: 502 });
  await writeState(io, {
    id: botId,
    region: regionOf(io.env),
    meetingUrl,
    createdAt: new Date(io.now()).toISOString(),
  });
  return { id: botId, region: regionOf(io.env), meetingUrl };
}

export function localRecallIo(env = process.env, fetchImpl = globalThis.fetch) {
  return {
    env,
    fetch: fetchImpl,
    statePath: STATE_PATH,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pollMs: 3000,
    leaveTimeoutMs: 60_000,
  };
}

async function requestLeave(io, id) {
  try {
    await recallFetch(io, `/bot/${id}/leave_call/`, { method: 'POST' });
    return { alreadyGone: false };
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return { alreadyGone: true, status: error.status };
    }
    throw error;
  }
}

function installSignals(onSignal) {
  const onSigint = () => {
    onSignal('SIGINT');
  };
  const onSigterm = () => {
    onSignal('SIGTERM');
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  return () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
}

async function join(flags, io) {
  if (flags.id) {
    io.stderr(USAGE);
    return 2;
  }
  const meetingUrl = flags.url ?? '';
  if (!/^https:\/\/.+/i.test(meetingUrl)) {
    io.stderr('会議 URL は https:// で始めてください。');
    io.stderr(USAGE);
    return 2;
  }

  const signal = { aborted: false };
  let botId = null;
  /** @type {Promise<number> | null} */
  let leaveTask = null;
  const uninstall = io.installSignals
    ? installSignals((name) => {
        if (signal.aborted) return;
        signal.aborted = true;
        io.stderr(`${name} を受けたので退出を要求します`);
        leaveTask = (async () => {
          if (!botId) return 1;
          try {
            const result = await requestLeave(io, botId);
            io.stdout(
              result.alreadyGone
                ? result.status === 404
                  ? 'ボットは見つかりません。'
                  : 'すでに退出しています'
                : `退出を要求しました ${botId}`,
            );
            return 0;
          } catch (error) {
            io.stderr(error.message);
            return 1;
          }
        })();
      })
    : () => {};

  try {
    let sent;
    try {
      sent = await sendBot(meetingUrl, io);
    } catch (error) {
      if (error instanceof RecallCliError) {
        io.stderr(error.message);
        return error.exitCode;
      }
      throw error;
    }
    botId = sent.id;
    io.stdout(`ボットを送信しました ${botId}`);
    if (signal.aborted) return (await leaveTask) ?? 1;

    const result = await poll(io, botId, {
      timeoutMs: io.joinTimeoutMs,
      signal,
      succeed: (change) => JOIN_OK.has(change.code),
      fail: (change) => JOIN_FAIL.has(change.code),
    });
    if (result.aborted) return (await leaveTask) ?? 1;
    if (result.ok) {
      io.stdout(`入室しました (${result.latest.code})`);
      return 0;
    }
    if (result.timeout && result.latest?.code === 'in_waiting_room') {
      io.stderr('ホストが許可していません。timeout_exceeded_waiting_room');
      return 1;
    }
    if (result.timeout) {
      io.stderr(`540秒を超えました。最後の状態: ${result.latest?.code ?? '不明'}`);
      return 1;
    }
    printFailure(io, result.latest);
    return 1;
  } finally {
    uninstall();
  }
}

async function status(flags, io) {
  if (flags.url || flags.id) {
    io.stderr(USAGE);
    return 2;
  }
  const state = await readState(io);
  if (!state) {
    io.stderr('状態ファイルがありません。');
    return 1;
  }
  const bot = await recallFetch(io, `/bot/${state.id}/`);
  const changes = sortedChanges(bot);
  if (changes.length === 0) {
    io.stdout(`${state.id}  状態なし`);
    return 0;
  }
  for (const change of changes) io.stdout(formatChange(change));
  return 0;
}

export async function removeBot(io, id) {
  const result = await requestLeave(io, id);
  if (result.alreadyGone) {
    await clearState(io, id);
    return { id, left: true, alreadyGone: true, status: result.status ?? null, code: null };
  }
  const polled = await poll(io, id, {
    timeoutMs: io.leaveTimeoutMs,
    succeed: (change) => change.code === 'call_ended' || change.code === 'done',
    fail: (change) => change.code === 'fatal',
  });
  if (polled.ok) {
    await clearState(io, id);
    return { id, left: true, alreadyGone: false, status: null, code: polled.latest.code };
  }
  return {
    id,
    left: false,
    alreadyGone: false,
    timeout: Boolean(polled.timeout),
    latest: polled.latest ?? null,
  };
}

async function leave(flags, io) {
  if (flags.url) {
    io.stderr(USAGE);
    return 2;
  }
  const state = await readState(io);
  const id = flags.id || state?.id;
  if (!id) {
    io.stderr('退出するボットがありません。');
    return 1;
  }
  const result = await removeBot(io, id);
  if (result.alreadyGone) {
    io.stdout(
      result.status === 404
        ? 'ボットは見つかりません。状態ファイルを消しました。'
        : 'すでに退出しています',
    );
    return 0;
  }
  if (result.left) {
    io.stdout(`退出しました (${result.code})`);
    return 0;
  }
  if (result.timeout) {
    io.stderr('60秒以内に call_ended / done になりませんでした');
    return 1;
  }
  printFailure(io, result.latest);
  return 1;
}

function ioWithDefaults(io) {
  return {
    fetch: globalThis.fetch,
    statePath: STATE_PATH,
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
    env: process.env,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    joinTimeoutMs: 540_000,
    leaveTimeoutMs: 60_000,
    pollMs: 3000,
    installSignals: false,
    ...io,
  };
}

export async function run(argv, io = {}) {
  const full = ioWithDefaults(io);
  const parsed = parseArgs(argv);
  if (parsed.error) {
    full.stderr(parsed.error);
    full.stderr(USAGE);
    return 2;
  }
  if (!parsed.command || parsed.extra.length > 0) {
    if (parsed.extra.length > 0) full.stderr(`余分な引数です: ${parsed.extra.join(' ')}`);
    full.stderr(USAGE);
    return 2;
  }
  if (parsed.command === 'join') return join(parsed.flags, full);
  if (parsed.command === 'status') return status(parsed.flags, full);
  if (parsed.command === 'leave') return leave(parsed.flags, full);
  full.stderr(USAGE);
  return 2;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  loadEnvFile(path.join(ROOT, '.env'));
  run(process.argv.slice(2), { installSignals: true }).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
