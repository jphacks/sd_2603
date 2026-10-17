const BOT_ID = /^[A-Za-z0-9_-]+$/

export class RecallError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, body?: unknown }} [detail]
   */
  constructor(message, detail = {}) {
    super(message)
    this.name = 'RecallError'
    this.status = detail.status ?? 0
    this.body = detail.body ?? null
  }
}

export function recallRegion(env) {
  return (env.RECALL_REGION || 'ap-northeast-1').trim()
}

export function recallBaseUrl(env) {
  return `https://${recallRegion(env)}.recall.ai/api/v1`
}

export function formatRecallHttpError(status, body) {
  if (status === 401) {
    return '401: API キーと RECALL_REGION が同じリージョンか確認してください。'
  }
  if (status === 507) {
    return '507: アドホック枠が足りません。待って 1 回だけ再実行してください。'
  }
  const record = body && typeof body === 'object' ? body : null
  const detail = record?.detail || record?.message || record?.error || ''
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return `Recall API ${status}${text ? `: ${text}` : ''}`
}

/**
 * @param {{ env: NodeJS.ProcessEnv, fetch: typeof fetch }} io
 * @param {string} pathName
 * @param {{ method?: string, body?: unknown }} [options]
 */
export async function recallRequest(io, pathName, options = {}) {
  const key = String(io.env.RECALL_API_KEY || '').trim()
  if (!key) {
    throw new RecallError('RECALL_API_KEY がありません。sd_2603/.env に入れてください。')
  }
  const response = await io.fetch(`${recallBaseUrl(io.env)}${pathName}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Token ${key}`,
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
  }
  if (!response.ok) {
    throw new RecallError(formatRecallHttpError(response.status, body), {
      status: response.status,
      body,
    })
  }
  return body ?? {}
}

function botPath(id, suffix) {
  if (!BOT_ID.test(id)) {
    throw new RecallError('bot id の形式が不正です')
  }
  return `/bot/${id}${suffix}`
}

export function createBot(io, body) {
  return recallRequest(io, '/bot/', { method: 'POST', body })
}

export function retrieveBot(io, id) {
  return recallRequest(io, botPath(id, '/'))
}

export async function leaveCall(io, id) {
  try {
    await recallRequest(io, botPath(id, '/leave_call/'), { method: 'POST' })
    return { alreadyGone: false }
  } catch (error) {
    if (error instanceof RecallError && (error.status === 400 || error.status === 404)) {
      return { alreadyGone: true, status: error.status }
    }
    throw error
  }
}

export function sortedStatusChanges(bot) {
  const changes = Array.isArray(bot?.status_changes) ? [...bot.status_changes] : []
  changes.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  return changes
}

export function latestStatusChange(bot) {
  return sortedStatusChanges(bot).at(-1) ?? null
}
