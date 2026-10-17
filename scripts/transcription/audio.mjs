/** Recall: mono PCM16LE at 16 kHz. Preserve interpolation state across packets. */
export function createResampler() {
  let previous;
  let position = 0;
  return (pcm) => {
    if (pcm.length % 2) throw new Error('Invalid PCM length');
    const samples = previous === undefined ? [] : [previous];
    for (let i = 0; i < pcm.length; i += 2) samples.push(pcm.readInt16LE(i));
    if (!samples.length) return Buffer.alloc(0);
    const output = [];
    while (position < samples.length - 1) {
      const index = Math.floor(position);
      const fraction = position - index;
      output.push(Math.round(samples[index] * (1 - fraction) + samples[index + 1] * fraction));
      position += 2 / 3;
    }
    position -= samples.length - 1;
    previous = samples.at(-1);
    const bytes = Buffer.alloc(output.length * 2);
    output.forEach((value, index) => bytes.writeInt16LE(value, index * 2));
    return bytes;
  };
}

export function readRecallAudio(message, expectedBotId) {
  const payload = JSON.parse(message);
  if (payload.event !== 'audio_mixed_raw.data') return null;
  if (payload.data?.bot?.id !== expectedBotId) throw new Error('Unexpected bot');
  const encoded = payload.data?.data?.buffer;
  if (typeof encoded !== 'string' || encoded.length > 128000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Invalid audio buffer');
  }
  const audio = Buffer.from(encoded, 'base64');
  if (audio.length % 2) throw new Error('Invalid PCM length');
  return audio;
}

export function recordingConfig(endpoint, token) {
  const url = new URL(endpoint);
  if (url.protocol !== 'wss:' || !token || token.length < 32) throw new Error('A public wss URL and a token of at least 32 characters are required');
  url.pathname = '/recall/audio/';
  url.search = '';
  url.searchParams.set('token', token);
  return { audio_mixed_raw: {}, realtime_endpoints: [{ type: 'websocket', url: url.href, events: ['audio_mixed_raw.data'] }] };
}
