import assert from 'node:assert/strict'
import test from 'node:test'
import { createMeetingFeed } from './feed.mjs'
import { createTranscriptStore } from './transcript.mjs'

test('a stored line is judged with the agenda and intervention starts a cooldown', async () => {
  const store = createTranscriptStore()
  let clock = 1_000_000
  const seen = []
  const feed = createMeetingFeed(store, {
    now: () => clock,
    judge: async (input) => {
      seen.push(input)
      return input.transcript.length > 1
        ? { action: 'WAIT', reason: 'cooldown path', message: null }
        : { action: 'INTERVENE', reason: 'off topic', message: '戻りませんか？' }
    },
  })
  feed.remember('bot-1', '  予算を決める  ')
  store.add({ botId: 'bot-1', speaker: '田中', text: '脱線', start: 1 })
  const first = await feed.afterLine({ botId: 'bot-1', speaker: '田中', text: '脱線', start: 1 })
  assert.equal(first.action, 'INTERVENE')
  assert.equal(seen[0].agenda, '予算を決める')
  assert.equal(seen[0].secondsSinceLastIntervention, 10_000)

  clock += 5_000
  store.add({ botId: 'bot-1', speaker: '田中', text: 'まだ脱線', start: 2 })
  await feed.afterLine({ botId: 'bot-1', speaker: '田中', text: 'まだ脱線', start: 2 })
  assert.equal(seen[1].secondsSinceLastIntervention, 5)
  assert.equal(feed.snapshot('bot-1').judgment.action, 'WAIT')
  assert.deepEqual(feed.snapshot('bot-1').lines.map((line) => line.text), ['脱線', 'まだ脱線'])
})

test('a failed judgment keeps the previous result', async () => {
  const store = createTranscriptStore()
  let fail = false
  const feed = createMeetingFeed(store, {
    judge: async () => {
      if (fail) throw new Error('Jev execution blocked')
      return { action: 'WAIT', reason: 'listening', message: null }
    },
  })
  store.add({ botId: 'bot-1', speaker: '田中', text: '一つ', start: 1 })
  await feed.afterLine({ botId: 'bot-1', speaker: '田中', text: '一つ', start: 1 })
  fail = true
  store.add({ botId: 'bot-1', speaker: '田中', text: '二つ', start: 2 })
  await assert.rejects(
    () => feed.afterLine({ botId: 'bot-1', speaker: '田中', text: '二つ', start: 2 }),
    /blocked/,
  )
  assert.equal(feed.snapshot('bot-1').judgment.action, 'WAIT')
  assert.equal(feed.snapshot('bot-9').agenda, '会議の議題')
})
