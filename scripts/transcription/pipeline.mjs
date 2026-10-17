import { createGateway, experimental_streamTranscribe as streamTranscribe } from 'ai';

export const MODEL = 'openai/gpt-realtime-whisper';

export async function streamMeetingAudio(audio, { apiKey, signal, onPart, transcribe = streamTranscribe, upstream = createGateway({ apiKey }).transcription(MODEL) }) {
  let finishedEmpty = false;
  let nonemptyFinal = false;
  // Observe the provider's finish before the SDK converts an empty transcript
  // into the same error used for an unexpectedly truncated stream.
  const model = Object.create(upstream, {
    doStream: { value: async options => {
      const result = await upstream.doStream(options);
      return {
        ...result,
        stream: result.stream.pipeThrough(new TransformStream({
          transform(part, controller) {
            if (part.type === 'finish') finishedEmpty = part.text === '';
            controller.enqueue(part);
          },
        })),
      };
    } },
  });
  const result = transcribe({
    model,
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: { openai: { language: 'ja', streaming: { delay: 'low' } } },
    abortSignal: signal,
    maxRetries: 0,
  });
  try {
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw new Error('Transcription upstream failed');
      if (part.type === 'transcript-final') {
        if (!part.text?.trim()) continue;
        nonemptyFinal = true;
      }
      if (part.type === 'transcript-delta' || part.type === 'transcript-partial' || part.type === 'transcript-final') onPart(part);
    }
    return await result.text;
  } catch (error) {
    if (error?.name === 'AI_NoTranscriptGeneratedError' && finishedEmpty && !nonemptyFinal) {
      onPart({ type: 'transcript-empty' });
      return { skippedEmpty: true };
    }
    throw error;
  }
}

export function isVoicedPcm(pcm, threshold = 300) {
  if (!pcm.length || pcm.length % 2) return false;
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
  return Math.sqrt(energy / (pcm.length / 2)) >= threshold;
}

/** Final-only transcripts are considered for intervention after a quiet window. */
export function createInterventionGate({ agenda, botId, resolveAgenda, decide, display, restoreIdle, onError = () => {}, now = Date.now, schedule = setTimeout, unschedule = clearTimeout, quietMs = 1500, displayMs = 8000 }) {
  if (!Number.isFinite(displayMs) || displayMs <= 0) throw new RangeError('Invalid intervention display duration');
  const transcript = [];
  let finalQueue = [];
  let speaking = false;
  let lastVoice = -Infinity;
  let lastIntervention = -Infinity;
  let decisionTimer;
  let speakingTimer;
  let generation = 0;
  let processing = false;
  let stopped = false;
  let hasSpeech = false;
  let partial = '';
  let pendingAudio = false;
  let idleTimer;
  let displayEpoch = 0;
  let finalRevision = 0;
  let offAgendaCandidate;
  let agendaVersion;
  let videoQueue = Promise.resolve();
  const videoAbort = new AbortController();

  const stop = () => {
    stopped = true;
    displayEpoch++;
    offAgendaCandidate = undefined;
    for (const timer of [decisionTimer, speakingTimer, idleTimer]) if (timer !== undefined) unschedule(timer);
    decisionTimer = speakingTimer = idleTimer = undefined;
    videoAbort.abort();
  };
  const fail = error => {
    if (stopped) return;
    stop();
    onError(error);
  };
  // A restore already in flight must finish before a newer card is sent. Checking
  // its epoch inside this queue also discards a restore waiting behind a new card.
  const changeVideo = operation => {
    const task = videoQueue.then(() => stopped ? { cancelled: true } : operation());
    videoQueue = task.catch(() => {});
    return task;
  };
  const armIdle = () => {
    const epoch = ++displayEpoch;
    if (idleTimer !== undefined) unschedule(idleTimer);
    if (!restoreIdle) return;
    idleTimer = schedule(() => {
      if (stopped || epoch !== displayEpoch) return;
      idleTimer = undefined;
      void changeVideo(async () => {
        if (epoch !== displayEpoch) return;
        await restoreIdle({ botId, signal: videoAbort.signal });
      }).catch(fail);
    }, displayMs);
  };
  const canDisplay = value => !stopped && !pendingAudio && !speaking && generation === value && now() - lastVoice >= quietMs;
  // A model recommendation is not a display instruction. Off-agenda cards need
  // confirmation on a later final revision; repeating the same context cannot vote twice.
  const confirmsDisplay = (result, revision) => {
    if (result.reason === 'Discussion appears stalled') {
      offAgendaCandidate = undefined;
      return true;
    }
    const previous = offAgendaCandidate;
    if (previous && previous.reason === result.reason) return revision > previous.revision;
    offAgendaCandidate = { reason: result.reason, revision };
    return false;
  };

  const run = async () => {
    decisionTimer = undefined;
    if (stopped || pendingAudio || speaking || now() - lastVoice < quietMs || !finalQueue.length || !hasSpeech || processing) return;
    processing = true;
    const batch = finalQueue.splice(0);
    const next = [...transcript, ...batch].slice(-30);
    while (next.length > 1 && Buffer.byteLength(JSON.stringify(next)) > 8_000) next.shift();
    let currentGeneration = generation;
    const currentRevision = finalRevision;
    transcript.splice(0, transcript.length, ...next);
    try {
      if (resolveAgenda) {
        const snapshot = await resolveAgenda({ botId, agenda, signal: videoAbort.signal });
        if (snapshot?.cancelled) {
          offAgendaCandidate = undefined;
          if (generation === currentGeneration && !finalQueue.length) hasSpeech = false;
          return;
        }
        if (!snapshot || typeof snapshot.agenda !== 'string' || !snapshot.agenda.trim() || snapshot.agenda.length > 2000 || typeof snapshot.agendaVersion !== 'string' || !snapshot.agendaVersion || snapshot.agendaVersion.length > 128) throw new Error('Invalid agenda snapshot');
        if (stopped || generation !== currentGeneration) { offAgendaCandidate = undefined; return; }
        if (agendaVersion !== snapshot.agendaVersion || agenda !== snapshot.agenda) {
          offAgendaCandidate = undefined;
          agenda = snapshot.agenda;
          agendaVersion = snapshot.agendaVersion;
          currentGeneration = ++generation;
        }
      }
      const currentAgenda = agenda;
      const currentAgendaVersion = agendaVersion;
      const transcriptBudget = Math.min(8_000, 10_000 - Buffer.byteLength(JSON.stringify(currentAgenda)));
      while (next.length > 1 && Buffer.byteLength(JSON.stringify(next)) > transcriptBudget) next.shift();
      transcript.splice(0, transcript.length, ...next);
      const result = await decide({ botId, agenda: currentAgenda, agendaVersion: currentAgendaVersion, transcript: next, secondsSinceLastIntervention: Number.isFinite(lastIntervention) ? Math.max(0, (now() - lastIntervention) / 1000) : 60 });
      if (generation === currentGeneration && !finalQueue.length) hasSpeech = false;
      if (result?.cancelled) {
        offAgendaCandidate = undefined;
      } else if (canDisplay(currentGeneration) && result.action !== 'INTERVENE') {
        offAgendaCandidate = undefined;
      } else if (canDisplay(currentGeneration) && confirmsDisplay(result, currentRevision)) {
        await changeVideo(async () => {
          if (!canDisplay(currentGeneration)) return { cancelled: true };
          const displayed = await display({ botId, agenda: currentAgenda, agendaVersion: currentAgendaVersion, result, generation: currentGeneration, signal: videoAbort.signal });
          if (displayed?.cancelled) offAgendaCandidate = undefined;
          if (!stopped && !displayed?.cancelled) {
            offAgendaCandidate = undefined;
            lastIntervention = now();
            armIdle();
          }
          return displayed;
        });
      }
    } catch (error) {
      // Never retry an ambiguous display result: duplicate camera changes are worse than one missed intervention.
      fail(error);
      throw error;
    } finally {
      processing = false;
      if (finalQueue.length && !stopped) arm();
    }
  };
  const arm = () => {
    if (stopped || pendingAudio || !finalQueue.length || speaking) return;
    if (decisionTimer !== undefined) unschedule(decisionTimer);
    decisionTimer = schedule(() => { void run().catch(() => {}); }, Math.max(0, quietMs - (now() - lastVoice)));
  };
  return {
    setPendingAudio(value) {
      if (stopped) return;
      pendingAudio = Boolean(value);
      if (pendingAudio && decisionTimer !== undefined) { unschedule(decisionTimer); decisionTimer = undefined; }
      if (!pendingAudio) arm();
    },
    onAudio(pcm) {
      if (stopped) return;
      if (isVoicedPcm(pcm)) {
        if (!speaking) generation++;
        speaking = true;
        hasSpeech = true;
        lastVoice = now();
        if (speakingTimer !== undefined) unschedule(speakingTimer);
        if (decisionTimer !== undefined) { unschedule(decisionTimer); decisionTimer = undefined; }
        speakingTimer = schedule(() => { speakingTimer = undefined; speaking = false; arm(); }, quietMs);
      }
    },
    onPart(part) {
      if (stopped) return;
      if (part.type === 'transcript-delta') { partial += part.delta ?? ''; partial = partial.slice(-1000); return; }
      if (part.type === 'transcript-partial') { partial = (part.text ?? '').slice(-1000); return; }
      if (part.type !== 'transcript-final') return;
      partial = '';
      const text = part.text?.trim();
      if (!text || !hasSpeech) return;
      finalRevision++;
      finalQueue.push(text.slice(0, 1000));
      if (finalQueue.length > 30) finalQueue = finalQueue.slice(-30);
      arm();
    },
    get stopped() { return stopped; },
    get transcript() { return [...transcript]; },
    get partial() { return partial; },
    isQuiet(value) { return !stopped && !pendingAudio && !speaking && generation === value && now() - lastVoice >= quietMs; },
    stop,
  };
}
