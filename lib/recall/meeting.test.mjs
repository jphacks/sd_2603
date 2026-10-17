import assert from 'node:assert/strict'
import test from 'node:test'
import { RecallError } from './client.mjs'
import {
  joinMeeting,
  leaveMeeting,
  meetingUrlError,
  readMeeting,
  recallFailure,
  silentJoinBody,
} from './meeting.mjs'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body)
    },
  }
}

function ioWith(fetch) {
  return {
    env: {
      RECALL_API_KEY: 'secret-key',
      RECALL_REGION: 'ap-northeast-1',
      RECALL_WEBHOOK_URL: 'https://example.com/api/recall/webhook',
    },
    fetch,
  }
}

test('an app join asks for Japanese transcript and rejects a non-https URL', async () => {
  assert.match(meetingUrlError('http://meet.google.com/abc'), /https/)
  const silent = silentJoinBody('https://meet.google.com/abc-defg-hij')
  assert.equal(silent.recording_config, null)
  assert.equal(silent.bot_name, 'MTG Lab')
  assert.equal(silent.join_at, undefined)

  const posts = []
  const joined = await joinMeeting(
    ioWith(async (url, options) => {
      posts.push(JSON.parse(options.body))
      assert.equal(url, 'https://ap-northeast-1.recall.ai/api/v1/bot/')
      return jsonResponse(200, { id: 'bot-1' })
    }),
    'https://meet.google.com/abc-defg-hij',
  )
  assert.deepEqual(joined, { id: 'bot-1', region: 'ap-northeast-1' })
  assert.equal(posts[0].recording_config.transcript.provider.recallai_streaming.language_code, 'ja')
  assert.equal(posts[0].recording_config.realtime_endpoints[0].events[0], 'transcript.data')
  assert.equal(posts[0].join_at, undefined)

  await assert.rejects(
    () => joinMeeting(ioWith(async () => jsonResponse(200, {})), 'http://meet.google.com/abc'),
    (error) => error instanceof RecallError && error.status === 400,
  )
  await assert.rejects(
    () => joinMeeting(
      { env: { RECALL_API_KEY: 'secret-key' }, fetch: async () => jsonResponse(200, { id: 'bot-1' }) },
      'https://meet.google.com/abc-defg-hij',
    ),
    (error) => error instanceof RecallError && /RECALL_WEBHOOK_URL/.test(error.message),
  )
})

test('status reads the latest code and leave reports an already ended call', async () => {
  const status = await readMeeting(
    ioWith(async () => jsonResponse(200, {
      status_changes: [
        { code: 'joining_call', created_at: '2026-10-17T00:00:00Z' },
        { code: 'in_call_not_recording', created_at: '2026-10-17T00:00:02Z' },
      ],
    })),
    'bot-1',
  )
  assert.deepEqual(status, { id: 'bot-1', code: 'in_call_not_recording', subCode: null })

  const left = await leaveMeeting(
    ioWith(async () => jsonResponse(400, {})),
    'bot-1',
  )
  assert.deepEqual(left, { id: 'bot-1', left: true, alreadyGone: true })
  assert.equal(recallFailure(new RecallError('bot id の形式が不正です')).status, 400)
  assert.equal(recallFailure(new Error('boom')).status, 500)
  assert.equal(recallFailure(new Error('boom')).body.error.includes('boom'), false)
})

test('Gateway transcription mode requests raw audio instead of Recall transcripts', async () => {
  const env = { RECALL_API_KEY: 'test', ENABLE_REALTIME_TRANSCRIPTION: 'true', ALLOW_PAID_AI: 'true', RECALL_AUDIO_PUBLIC_URL: 'wss://example.test', RECALL_AUDIO_TOKEN: 'x'.repeat(32) }
  const io = { env, fetch: async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.recording_config.transcript, undefined)
    assert.deepEqual(body.recording_config.audio_mixed_raw, {})
    assert.deepEqual(body.recording_config.realtime_endpoints[0].events, ['audio_mixed_raw.data'])
    return jsonResponse(200, { id: 'bot-raw' })
  } }
  assert.equal((await joinMeeting(io, 'https://meet.google.com/abc-defg-hij')).id, 'bot-raw')
  await assert.rejects(joinMeeting({ ...io, env: { ...env, ALLOW_PAID_AI: 'false' } }, 'https://meet.google.com/abc-defg-hij'), /ALLOW_PAID_AI/)
})
