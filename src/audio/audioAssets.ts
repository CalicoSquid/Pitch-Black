const audioBufferCache = new Map<string, Promise<AudioBuffer>>()

function publicAudioUrl(fileName: string) {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}audio/${fileName}`
}

export function loadPitchAudioAsset(audioCtx: AudioContext, fileName: string) {
  const url = publicAudioUrl(fileName)
  const cached = audioBufferCache.get(url)
  if (cached) return cached

  const pending = fetch(url, { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load audio asset: ${fileName}`)
      return response.arrayBuffer()
    })
    .then((bytes) => audioCtx.decodeAudioData(bytes.slice(0)))
    .catch((error) => {
      audioBufferCache.delete(url)
      throw error
    })

  audioBufferCache.set(url, pending)
  return pending
}


export const PITCH_AUDIO_BANK = [
  'night-ambience-loop.mp3',
  'rain-steady-loop.mp3',
  'rain-heavy-loop.mp3',
  'owl-field.mp3',
  'distant-train-bed.mp3',
  'distant-train-horn.mp3',
  'thunder-distant.mp3',
  'thunder-close.mp3',
] as const

/**
 * Decode the small production audio bank as soon as Sound is enabled. The files
 * remain browser/service-worker cached after first load, and prewarming removes
 * first-event fetch/decode latency from owl, train and thunder without starting
 * any audible source nodes.
 */
export function warmPitchAudioBank(audioCtx: AudioContext) {
  return Promise.allSettled(PITCH_AUDIO_BANK.map((fileName) => loadPitchAudioAsset(audioCtx, fileName)))
}
