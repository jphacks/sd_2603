import { transcriptStore } from './transcript.mjs'

export const DEFAULT_AGENDA = '会議の議題'

export function createMeetingFeed(store, { judge, now = () => Date.now() }) {
  const agendas = new Map()
  const judgments = new Map()
  const lastInterventionAt = new Map()

  return {
    remember(botId, agenda) {
      const text = String(agenda ?? '').trim()
      agendas.set(botId, text || DEFAULT_AGENDA)
    },
    async afterLine(line) {
      const previous = lastInterventionAt.get(line.botId)
      const secondsSinceLastIntervention = previous == null
        ? 10_000
        : Math.max(0, (now() - previous) / 1000)
      const judgment = await judge({
        agenda: agendas.get(line.botId) || DEFAULT_AGENDA,
        transcript: store.list(line.botId).map((item) => item.text),
        secondsSinceLastIntervention,
      })
      if (judgment?.action === 'INTERVENE') lastInterventionAt.set(line.botId, now())
      judgments.set(line.botId, judgment)
      return judgment
    },
    snapshot(botId) {
      return {
        id: botId,
        agenda: agendas.get(botId) || DEFAULT_AGENDA,
        lines: store.list(botId),
        judgment: judgments.get(botId) ?? null,
      }
    },
  }
}

export function meetingFeed(judge) {
  if (!globalThis.__mtgMeetingFeed) {
    globalThis.__mtgMeetingFeed = createMeetingFeed(transcriptStore(), { judge })
  }
  return globalThis.__mtgMeetingFeed
}
