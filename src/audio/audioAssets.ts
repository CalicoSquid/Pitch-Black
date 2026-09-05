import { AudioBufferCache } from './audioBufferCache'

const audioBufferCache = new AudioBufferCache()
const pendingDecodes = new Map<string, Promise<AudioBuffer>>()

function publicAudioUrl(fileName: string) {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}audio/${fileName}`
}

export function loadPitchAudioAsset(audioCtx: AudioContext, fileName: string) {
  const url = publicAudioUrl(fileName)
  const key = `${audioCtx.sampleRate}:${url}`
  const cached = audioBufferCache.get(key)
  if (cached) return Promise.resolve(cached)
  const existing = pendingDecodes.get(key)
  if (existing) return existing

  const pending = fetch(url, { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load audio asset: ${fileName}`)
      return response.arrayBuffer()
    })
    .then((bytes) => audioCtx.decodeAudioData(bytes))
    .then((buffer) => {
      audioBufferCache.set(key, buffer)
      pendingDecodes.delete(key)
      return buffer
    }, (error) => {
      pendingDecodes.delete(key)
      throw error
    })

  pendingDecodes.set(key, pending)
  return pending
}


export const PITCH_AUDIO_BANK = [
  'night-ambience-crickets-v2.mp3',
  'rain-steady-loop.mp3',
  'rain-heavy-loop.mp3',
  'owl-field.mp3',
  'distant-train-bed.mp3',
  'distant-train-horn.mp3',
  'thunder-distant.mp3',
  'thunder-close.mp3',
] as const

/**
 * Warm compressed recordings in the HTTP/service-worker cache. Decoding all MP3s
 * here retains far more PCM memory than their download size suggests. Scene and
 * event owners request decoding when needed, including ahead of delayed cues.
 */
export async function warmPitchAudioBank(signal?: AbortSignal) {
  for (const fileName of PITCH_AUDIO_BANK) {
    if (signal?.aborted) return
    try {
      const response = await fetch(publicAudioUrl(fileName), { cache: 'force-cache', signal })
      // Consume one response at a time so the cache fills without a decode burst.
      await response.arrayBuffer()
    } catch {
      // Optional audio or an aborted warmup must never interrupt the page.
    }
  }
}
