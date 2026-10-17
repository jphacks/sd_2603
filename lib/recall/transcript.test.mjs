import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {
  createTranscriptStore,
  ingestTranscript,
  utteranceFromPayload,
  verifyRecallWebhook,
} from './transcript.mjs'

const SECRET = `whsec_${Buffer.from('test-secret-key-32bytes-long!!!!').toString('base64')}`

function signed(rawBody, signature = null) {
  const msgId = 'msg_test'
  const msgTimestamp = '1731705121'
  const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64')
  const expected = createHmac('sha256', key)
    .update(`${msgId}.${msgTimestamp}.${rawBody}`)
    .digest('base64')
  return {
    headers: {
      'webhook-id': msgId,
      'webhook-timestamp': msgTimestamp,
      'webhook-signature': signature ?? `v1,${expected}`,
    },
  }
}

function linePayload(speaker, text) {
  return JSON.stringify({
    event: 'transcript.data',
    data: {
      data: {
        words: [{ text, start_timestamp: { relative: 1.25 } }],
        participant: { id: 1, name: speaker },
      },
      bot: { id: 'bot-1' },
    },
  })
}

test('a signed Japanese utterance is stored once and the bot is ignored', () => {
  const rawBody = linePayload('田中', 'そろそろ議題')
  verifyRecallWebhook({ secret: SECRET, ...signed(rawBody), payload: rawBody })
  assert.throws(
    () => verifyRecallWebhook({ secret: SECRET, ...signed(rawBody, 'v1,aaaa'), payload: rawBody }),
    /署名が一致しません/,
  )
  assert.throws(
    () => verifyRecallWebhook({ secret: 'not-a-secret', headers: {}, payload: '' }),
    (error) => error.status === 500 && !String(error.message).includes('not-a-secret'),
  )

  const store = createTranscriptStore()
  const first = ingestTranscript(store, { secret: SECRET, rawBody, ...signed(rawBody) })
  const again = ingestTranscript(store, { secret: SECRET, rawBody, ...signed(rawBody) })
  assert.equal(first.stored, true)
  assert.equal(again.stored, false)
  assert.deepEqual(store.list('bot-1'), [
    { speaker: '田中', text: 'そろそろ議題', start: 1.25 },
  ])

  const self = linePayload('MTG Lab', '戻ります')
  const ignored = ingestTranscript(store, { secret: SECRET, rawBody: self, ...signed(self) })
  assert.equal(ignored.stored, false)
  assert.equal(store.list('bot-1').length, 1)
  assert.equal(utteranceFromPayload({ event: 'transcript.partial_data' }).kind, 'ignore')
})
