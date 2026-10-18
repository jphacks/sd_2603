import { createResampler } from './audio.mjs';
import { isVoicedPcm } from './pipeline.mjs';

const PCM_RATE = 16000;

/** Send the first utterance live; hold only later utterances while its final is pending. */
export function createSegmentedTranscriber({ transcribe, onPart, onPendingChange = () => {}, onError = () => {}, signal, silenceMs = 1200, maxSegmentMs = 45000, maxBufferedBytes = 3_200_000, finalTimeoutMs = 15000 }) {
  const silenceSamples = PCM_RATE * silenceMs / 1000;
  const maxSegmentBytes = PCM_RATE * 2 * maxSegmentMs / 1000;
  let preRoll = [];
  let current;
  let active;
  let queue = [];
  let bufferedBytes = 0;
  let stopped = false;
  let pending = false;
  let started = 0;
  let completed = 0;

  const updatePending = () => {
    const next = Boolean(current || active || queue.length);
    if (next !== pending) { pending = next; onPendingChange(next); }
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (active?.timer) clearTimeout(active.timer);
    active?.abort?.abort();
    current = undefined;
    active = undefined;
    queue = [];
    preRoll = [];
    bufferedBytes = 0;
  };
  const fail = error => {
    if (stopped) return;
    stop();
    onError(error);
  };
  const pump = segment => {
    if (!segment.controller || stopped) return;
    while (segment.nextIndex < segment.chunks.length && segment.controller.desiredSize > 0) {
      segment.controller.enqueue(new Uint8Array(segment.resample(segment.chunks[segment.nextIndex++])));
    }
    if (segment.closed && segment.nextIndex === segment.chunks.length && !segment.streamClosed) {
      segment.streamClosed = true;
      segment.controller.close();
    }
  };
  const armFinalTimeout = segment => {
    if (!segment.closed || segment !== active || segment.timer || stopped) return;
    segment.timer = setTimeout(() => fail(new Error('STT final timeout')), finalTimeoutMs);
  };
  const launch = segment => {
    if (stopped || active) return;
    active = segment;
    segment.number = ++started;
    segment.resample = createResampler();
    segment.nextIndex = 0;
    segment.abort = new AbortController();
    if (signal?.aborted) { fail(signal.reason ?? new Error('STT aborted')); return; }
    const onAbort = () => segment.abort.abort(signal.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    const audio = new ReadableStream({
      start(controller) { segment.controller = controller; pump(segment); },
      pull() { pump(segment); },
    }, { highWaterMark: 32 });
    armFinalTimeout(segment);
    let finalCount = 0;
    void Promise.resolve().then(() => {
      if (stopped || segment.abort.signal.aborted) return;
      return transcribe(audio, {
      signal: segment.abort.signal,
      onPart(part) {
        if (stopped) return;
        if (part.type === 'transcript-final') finalCount++;
        onPart(part);
      },
      });
    }).then(result => {
      if (stopped) return;
      if (!segment.closed || (finalCount === 0 && result?.skippedEmpty !== true)) throw new Error('STT ended without a completed utterance');
      if (segment.timer) clearTimeout(segment.timer);
      signal?.removeEventListener('abort', onAbort);
      bufferedBytes -= segment.bytes;
      completed++;
      active = undefined;
      if (queue.length) launch(queue.shift());
      else if (current) launch(current);
      updatePending();
    }).catch(fail);
    updatePending();
  };
  const finish = () => {
    if (!current || stopped) return;
    const segment = current;
    current = undefined;
    segment.closed = true;
    preRoll = [];
    if (segment === active) { pump(segment); armFinalTimeout(segment); }
    else { queue.push(segment); if (!active) launch(queue.shift()); }
    updatePending();
  };

  return {
    push(pcm) {
      if (stopped) return;
      if (!Buffer.isBuffer(pcm) || pcm.length === 0 || pcm.length % 2) { fail(new Error('Invalid PCM frame')); return; }
      const voiced = isVoicedPcm(pcm);
      if (!current) {
        if (!voiced) {
          preRoll.push(pcm);
          if (preRoll.length > 2) preRoll.shift();
          return;
        }
        const chunks = [...preRoll, pcm];
        const bytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        current = { chunks, bytes, quietSamples: 0, closed: false };
        bufferedBytes += bytes;
        preRoll = [];
        updatePending();
        if (!active) launch(current);
      } else {
        current.chunks.push(pcm);
        current.bytes += pcm.length;
        bufferedBytes += pcm.length;
        current.quietSamples = voiced ? 0 : current.quietSamples + pcm.length / 2;
        if (current === active) pump(current);
      }
      if (bufferedBytes > maxBufferedBytes) { fail(new Error('STT audio buffer limit')); return; }
      if (current.quietSamples >= silenceSamples || current.bytes >= maxSegmentBytes) finish();
    },
    stop,
    get pending() { return pending && !stopped; },
    get status() {
      return { started, completed, activeSegment: active?.number ?? null, activeClosed: active?.closed ?? null, queued: queue.length };
    },
  };
}
