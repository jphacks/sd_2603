import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBot,
  formatRecallHttpError,
  leaveCall,
  recallBaseUrl,
  recallRegion,
  RecallError,
  recallRequest,
  retrieveBot,
  sortedStatusChanges,
} from './client.mjs'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body)
    },
  }
}

function ioWith(fetch, env = {}) {
  return {
    env: { RECALL_API_KEY: 'secret-key', RECALL_REGION: 'ap-northeast-1', ...env },
    fetch,
  }
}

test('region defaults to Tokyo and the key stays out of errors', async () => {
  assert.equal(recallRegion({}), 'ap-northeast-1')
  assert.equal(recallBaseUrl({ RECALL_REGION: 'us-west-2' }), 'https://us-west-2.recall.ai/api/v1')
  assert.equal(formatRecallHttpError(401, { detail: 'secret-key' }), '401: API キーと RECALL_REGION が同じリージョンか確認してください。')
  assert.match(formatRecallHttpError(507, {}), /507/)

  await assert.rejects(
    () => recallRequest(ioWith(async () => jsonResponse(200, {}), { RECALL_API_KEY: '' }), '/bot/'),
    (error) => {
      assert.ok(error instanceof RecallError)
      assert.equal(error.status, 0)
      assert.equal(error.message.includes('secret-key'), false)
      return true
    },
  )
})

test('create and retrieve send a Token header to the region host', async () => {
  const calls = []
  const io = ioWith(async (url, options) => {
    calls.push({ url, options })
    return jsonResponse(200, { id: 'bot-1' })
  })

  await createBot(io, { meeting_url: 'https://meet.google.com/abc-defg-hij', recording_config: null })
  await retrieveBot(io, 'bot-1')

  assert.equal(calls[0].url, 'https://ap-northeast-1.recall.ai/api/v1/bot/')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers.Authorization, 'Token secret-key')
  assert.equal(JSON.parse(calls[0].options.body).recording_config, null)
  assert.equal(calls[1].url, 'https://ap-northeast-1.recall.ai/api/v1/bot/bot-1/')
  assert.equal(calls[1].options.method, 'GET')
  assert.equal(calls[1].options.body, undefined)
})

test('leave treats 400 as already gone and rejects a bad id before fetch', async () => {
  let calls = 0
  const gone = await leaveCall(
    ioWith(async () => {
      calls += 1
      return jsonResponse(400, { detail: 'not in call' })
    }),
    'bot-1',
  )
  assert.deepEqual(gone, { alreadyGone: true, status: 400 })
  assert.equal(calls, 1)

  await assert.rejects(
    () => leaveCall(ioWith(async () => {
      calls += 1
      return jsonResponse(200, {})
    }), '../bot'),
    (error) => error instanceof RecallError && error.message.includes('bot id'),
  )
  assert.equal(calls, 1)
})

test('status changes are ordered by time', () => {
  const changes = sortedStatusChanges({
    status_changes: [
      { code: 'in_call_not_recording', created_at: '2026-10-17T00:00:02Z' },
      { code: 'joining_call', created_at: '2026-10-17T00:00:00Z' },
    ],
  })
  assert.deepEqual(changes.map((change) => change.code), ['joining_call', 'in_call_not_recording'])
})
