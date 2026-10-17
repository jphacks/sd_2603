import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FocusCredentials, FocusSession } from "./types";
import { FocusError } from "./model";

type StoredSession = FocusSession & { controlToken: string; cameraToken: string };
const TTL = 12 * 60 * 60;
const directory = path.join(process.cwd(), ".focus", "sessions");

export function sameSecret(a: string, b: string) {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && first.length > 0 && timingSafeEqual(first, second);
}

function redisConfigured() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (Boolean(url) !== Boolean(token)) throw new FocusError("共有ストレージの設定を確認してください。", 503);
  if (url && new URL(url).protocol !== "https:") throw new FocusError("共有ストレージにはHTTPSが必要です。", 503);
  if (!url && process.env.NODE_ENV === "production") {
    throw new FocusError("公開環境の共有ストレージ（Upstash Redis）を設定してください。", 503);
  }
  return Boolean(url && token);
}

async function redis(command: (string | number)[]) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new FocusError("共有ストレージに接続できません。", 503);
  const body = await response.json() as { result: unknown; error?: string };
  if (body.error) throw new FocusError("共有ストレージを更新できません。", 503);
  return body.result;
}

function validateId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new FocusError("会議が見つかりません。", 404);
}

async function read(id: string): Promise<StoredSession> {
  validateId(id);
  let raw: string | null;
  if (redisConfigured()) raw = await redis(["GET", `focus:${id}`]) as string | null;
  else {
    try { raw = await readFile(path.join(directory, `${id}.json`), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new FocusError("会議が見つかりません。", 404);
      throw error;
    }
  }
  if (!raw) throw new FocusError("会議が見つかりません。", 404);
  const session = JSON.parse(raw) as StoredSession;
  if (session.expiresAt < Date.now()) throw new FocusError("会議の有効期限が切れました。", 410);
  return session;
}

function withoutSecrets(stored: StoredSession): FocusSession {
  const { controlToken: _control, cameraToken: _camera, ...session } = stored;
  void _control; void _camera;
  return session;
}

export async function loadSession(id: string, token: string, scope: "control" | "camera" = "control") {
  const session = await read(id);
  if (!sameSecret(token, scope === "control" ? session.controlToken : session.cameraToken)) throw new FocusError("この会議へのアクセス権がありません。", 401);
  return withoutSecrets(session);
}

async function persist(session: StoredSession, previous?: StoredSession) {
  if (redisConfigured()) {
    if (previous) {
      // Compare-and-set avoids losing updates when two controllers act together.
      const script = "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 else return 0 end";
      const result = await redis(["EVAL", script, 1, `focus:${session.id}`, JSON.stringify(previous), JSON.stringify(session), Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000))]);
      if (result !== 1) throw new FocusError("会議が更新されました。もう一度お試しください。", 409);
    } else await redis(["SET", `focus:${session.id}`, JSON.stringify(session), "EX", TTL]);
  } else {
    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, `${session.id}.json`);
    const temporary = `${filename}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporary, JSON.stringify(session), { mode: 0o600 });
    await rename(temporary, filename);
  }
}

export async function createSession(title: string): Promise<{ session: FocusSession; credentials: FocusCredentials }> {
  const stored: StoredSession = {
    id: crypto.randomUUID(), revision: 0, title, agenda: "", notes: [], proposal: null,
    sharedMessage: null, closed: false, expiresAt: Date.now() + TTL * 1000,
    controlToken: randomBytes(32).toString("base64url"), cameraToken: randomBytes(32).toString("base64url"),
  };
  await persist(stored);
  return { session: withoutSecrets(stored), credentials: { id: stored.id, controlToken: stored.controlToken, cameraToken: stored.cameraToken } };
}

const locks = new Map<string, Promise<unknown>>();

export async function updateSession(id: string, token: string, revision: number, update: (current: FocusSession) => FocusSession) {
  const previousLock = locks.get(id) ?? Promise.resolve();
  const task = previousLock.catch(() => {}).then(async () => {
    const previous = await read(id);
    if (!sameSecret(token, previous.controlToken)) throw new FocusError("この会議へのアクセス権がありません。", 401);
    if (previous.revision !== revision) throw new FocusError("会議が更新されました。最新の状態で再操作してください。", 409);
    const next = update(withoutSecrets(previous));
    await persist({ ...previous, ...next }, previous);
    return next;
  });
  locks.set(id, task);
  try { return await task; }
  finally { if (locks.get(id) === task) locks.delete(id); }
}
