import { createHmac, timingSafeEqual } from 'node:crypto'
import { BOT_NAME } from './meeting.mjs'

export function verifyRecallWebhook({ secret, headers, payload }) {
  const value = String(secret ?? '')
  if (!value.startsWith('whsec_')) {
    const error = new Error('RECALL_VERIFICATION_SECRET がありません。')
    error.status = 500
    throw error
  }
  const msgId = headers['webhook-id'] ?? headers['svix-id']
  const msgTimestamp = headers['webhook-timestamp'] ?? headers['svix-timestamp']
  const msgSignature = headers['webhook-signature'] ?? headers['svix-signature']
  if (!msgId || !msgTimestamp || !msgSignature) {
    const error = new Error('Webhook の署名ヘッダがありません。')
    error.status = 400
    throw error
  }
  const key = Buffer.from(value.slice('whsec_'.length), 'base64')
  const expected = createHmac('sha256', key)
    .update(`${msgId}.${msgTimestamp}.${payload ?? ''}`)
    .digest('base64')
  const expectedBytes = new Uint8Array(Buffer.from(expected, 'base64'))
  for (const versioned of String(msgSignature).split(' ')) {
    const [version, signature] = versioned.split(',')
    if (version !== 'v1' || !signature) continue
    const got = new Uint8Array(Buffer.from(signature, 'base64'))
    if (got.length === expectedBytes.length && timingSafeEqual(got, expectedBytes)) return
  }
  const error = new Error('Webhook の署名が一致しません。')
  error.status = 400
  throw error
}

export function utteranceFromPayload(payload) {
  if (payload?.event !== 'transcript.data') return { kind: 'ignore' }
  const data = payload.data?.data
  const botId = payload.data?.bot?.id
  if (typeof botId !== 'string' || !botId) return { kind: 'ignore' }
  const words = Array.isArray(data?.words) ? data.words : []
  const text = words.map((word) => String(word?.text ?? '')).join('').trim()
  if (!text) return { kind: 'ignore' }
  const speaker = typeof data?.participant?.name === 'string' && data.participant.name
    ? data.participant.name
    : '参加者'
  if (speaker === BOT_NAME) return { kind: 'self' }
  return {
    kind: 'line',
    line: {
      botId,
      speaker,
      text,
      start: words[0]?.start_timestamp?.relative ?? null,
    },
  }
}

export function createTranscriptStore() {
  const byBot = new Map()
  const seen = new Set()
  return {
    add(line) {
      const key = `${line.botId}|${line.start ?? ''}|${line.speaker}|${line.text}`
      if (seen.has(key)) return false
      seen.add(key)
      const list = byBot.get(line.botId) ?? []
      list.push({ speaker: line.speaker, text: line.text, start: line.start })
      byBot.set(line.botId, list)
      return true
    },
    list(botId) {
      return byBot.get(botId) ?? []
    },
  }
}

export function transcriptStore() {
  if (!globalThis.__mtgTranscripts) globalThis.__mtgTranscripts = createTranscriptStore()
  return globalThis.__mtgTranscripts
}

export function ingestTranscript(store, { secret, headers, rawBody }) {
  verifyRecallWebhook({ secret, headers, payload: rawBody })
  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    const error = new Error('Webhook の本文が JSON ではありません。')
    error.status = 400
    throw error
  }
  const parsed = utteranceFromPayload(payload)
  if (parsed.kind !== 'line') return { stored: false, line: null }
  return { stored: store.add(parsed.line), line: parsed.line }
}
