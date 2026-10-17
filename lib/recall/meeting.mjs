import {
  createBot,
  latestStatusChange,
  leaveCall,
  RecallError,
  recallRegion,
  retrieveBot,
} from './client.mjs'

export const BOT_NAME = 'MTG Lab'

export function recallIo(env = process.env, fetchImpl = globalThis.fetch) {
  return { env, fetch: fetchImpl }
}

export function meetingUrlError(meetingUrl) {
  if (!/^https:\/\/.+/i.test(String(meetingUrl ?? ''))) {
    return '会議 URL は https:// で始めてください。'
  }
  return null
}

export function silentJoinBody(meetingUrl) {
  return {
    meeting_url: meetingUrl,
    bot_name: BOT_NAME,
    recording_config: null,
    automatic_leave: {
      waiting_room_timeout: 540,
      noone_joined_timeout: 300,
    },
  }
}

export function transcriptJoinBody(meetingUrl, webhookUrl) {
  return {
    meeting_url: meetingUrl,
    bot_name: BOT_NAME,
    automatic_leave: {
      waiting_room_timeout: 540,
      noone_joined_timeout: 300,
    },
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {
            mode: 'prioritize_low_latency',
            language_code: 'ja',
          },
        },
      },
      realtime_endpoints: [
        {
          type: 'webhook',
          url: webhookUrl,
          events: ['transcript.data'],
        },
      ],
    },
  }
}

export function recallFailure(error) {
  if (error instanceof RecallError) {
    const badId = error.status === 0 && error.message.includes('bot id')
    const status = badId
      ? 400
      : error.status === 400 || error.status === 401 || error.status === 404 || error.status === 507
        ? error.status
        : error.status === 0
          ? 500
          : 502
    return { status, body: { error: error.message } }
  }
  return { status: 500, body: { error: 'Recall への接続に失敗しました' } }
}

export async function joinMeeting(io, meetingUrl) {
  const urlError = meetingUrlError(meetingUrl)
  if (urlError) throw new RecallError(urlError, { status: 400 })
  const webhookUrl = String(io.env.RECALL_WEBHOOK_URL || '').trim()
  if (!/^https:\/\/.+/i.test(webhookUrl)) {
    throw new RecallError(
      'RECALL_WEBHOOK_URL に公開された https の Webhook URL を入れてください。',
      { status: 400 },
    )
  }
  const created = await createBot(io, transcriptJoinBody(meetingUrl, webhookUrl))
  if (!created?.id) throw new RecallError('bot id が返りませんでした', { status: 502 })
  return { id: created.id, region: recallRegion(io.env) }
}

export async function readMeeting(io, id) {
  const bot = await retrieveBot(io, id)
  const latest = latestStatusChange(bot)
  return {
    id,
    code: latest?.code ?? null,
    subCode: latest?.sub_code ?? null,
  }
}

export async function leaveMeeting(io, id) {
  const result = await leaveCall(io, id)
  return { id, left: true, alreadyGone: result.alreadyGone }
}
