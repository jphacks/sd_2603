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

/** Evaluate new finals during speech; deliver a fresh recommendation only at a quiet boundary. */
export function createInterventionGate({ agenda, botId, resolveAgenda, decide, display, restoreIdle, onError = () => {}, now = Date.now, schedule = setTimeout, unschedule = clearTimeout, quietMs = 1500, displayMs = 8000, decisionIntervalMs = 10000, candidateTtlMs = 20000 }) {
  if (!Number.isFinite(displayMs) || displayMs <= 0) throw new RangeError('Invalid intervention display duration');
  if (!Number.isFinite(decisionIntervalMs) || decisionIntervalMs < 0 || !Number.isFinite(candidateTtlMs) || candidateTtlMs <= 0) throw new RangeError('Invalid decision timing');
  const transcript = [];
  let finalQueue = [];
  let speaking = false;
  let lastVoice = -Infinity;
  let lastIntervention = -Infinity;
  let decisionTimer;
  let deliveryTimer;
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
  let lastDecision = -Infinity;
  let recommendation;
  let offAgendaCandidate;
  let agendaVersion;
  let videoQueue = Promise.resolve();
  const videoAbort = new AbortController();

  const stop = () => {
    stopped = true;
    displayEpoch++;
    offAgendaCandidate = undefined;
    recommendation = undefined;
    for (const timer of [decisionTimer, deliveryTimer, speakingTimer, idleTimer]) if (timer !== undefined) unschedule(timer);
    decisionTimer = deliveryTimer = speakingTimer = idleTimer = undefined;
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
    if (result.manual === true || result.reason === 'Discussion appears stalled') {
      offAgendaCandidate = undefined;
      return true;
    }
    const previous = offAgendaCandidate;
    if (previous && now() - previous.createdAt <= candidateTtlMs && previous.reason === result.reason && revision > previous.revision) {
      offAgendaCandidate = { reason: result.reason, revision, createdAt: now() };
      return true;
    }
    offAgendaCandidate = { reason: result.reason, revision, createdAt: now() };
    return false;
  };

  const deliver = async () => {
    deliveryTimer = undefined;
    const candidate = recommendation;
    if (!candidate || stopped) return;
    if (now() - candidate.createdAt >= candidateTtlMs || candidate.revision !== finalRevision || candidate.generation !== generation) {
      recommendation = undefined;
      return;
    }
    if (!canDisplay(candidate.generation)) return;
    // The queue and remote display route both recheck quiet, agenda and device
    // controls. A context change while waiting can never resurrect this card.
    await changeVideo(async () => {
      if (recommendation !== candidate || !canDisplay(candidate.generation) || candidate.revision !== finalRevision || now() - candidate.createdAt >= candidateTtlMs) return { cancelled: true };
      recommendation = undefined;
      const displayed = await display({ botId, agenda: candidate.agenda, agendaVersion: candidate.agendaVersion, result: candidate.result, generation: candidate.generation, signal: videoAbort.signal });
      if (displayed?.cancelled) offAgendaCandidate = undefined;
      if (!stopped && !displayed?.cancelled) {
        offAgendaCandidate = undefined;
        lastIntervention = now();
        armIdle();
      }
      return displayed;
    });
  };
  const armDelivery = () => {
    if (deliveryTimer !== undefined) unschedule(deliveryTimer);
    deliveryTimer = undefined;
    if (!recommendation || stopped) return;
    const remaining = candidateTtlMs - (now() - recommendation.createdAt);
    // While audio is pending or voiced, only schedule expiry. Audio/STT state
    // changes wake delivery without polling or another model request.
    const delay = pendingAudio || speaking ? remaining : Math.min(remaining, Math.max(0, quietMs - (now() - lastVoice)));
    deliveryTimer = schedule(() => { void deliver().catch(fail); }, Math.max(0, delay));
  };

  const run = async () => {
    decisionTimer = undefined;
    if (stopped || !finalQueue.length || processing) return;
    processing = true;
    lastDecision = now();
    const evaluatedAt = now();
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
      if (stopped) return;
      if (result?.cancelled || generation !== currentGeneration || currentRevision !== finalRevision) {
        recommendation = undefined;
        offAgendaCandidate = undefined;
      } else if (result.action !== 'INTERVENE') {
        recommendation = undefined;
        offAgendaCandidate = undefined;
      } else if (now() - evaluatedAt >= candidateTtlMs) {
        recommendation = undefined;
        offAgendaCandidate = undefined;
      } else if (confirmsDisplay(result, currentRevision)) {
        recommendation = { result, revision: currentRevision, generation: currentGeneration, agenda: currentAgenda, agendaVersion: currentAgendaVersion, createdAt: evaluatedAt };
        armDelivery();
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
    if (stopped || !finalQueue.length || processing) return;
    if (decisionTimer !== undefined) unschedule(decisionTimer);
    decisionTimer = schedule(() => { void run().catch(() => {}); }, Math.max(0, decisionIntervalMs - (now() - lastDecision)));
  };
  return {
    setPendingAudio(value) {
      if (stopped) return;
      pendingAudio = Boolean(value);
      armDelivery();
      arm();
    },
    onAudio(pcm) {
      if (stopped) return;
      if (isVoicedPcm(pcm)) {
        if (!speaking) { generation++; recommendation = undefined; }
        speaking = true;
        hasSpeech = true;
        lastVoice = now();
        if (speakingTimer !== undefined) unschedule(speakingTimer);
        speakingTimer = schedule(() => { speakingTimer = undefined; speaking = false; armDelivery(); }, quietMs);
      }
    },
    onPart(part) {
      if (stopped) return;
      if (part.type === 'transcript-delta') { partial += part.delta ?? ''; partial = partial.slice(-1000); return; }
      if (part.type === 'transcript-partial') { partial = (part.text ?? '').slice(-1000); return; }
      if (part.type !== 'transcript-final') return;
      partial = '';
      const text = part.text?.trim();
      if (!text || (!hasSpeech && !pendingAudio)) return;
      finalRevision++;
      // The remote quiet check carries this generation too: a final arriving
      // while the video route renders must invalidate that older display.
      generation++;
      recommendation = undefined;
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
