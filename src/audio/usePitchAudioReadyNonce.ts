import { useEffect, useState } from 'react'
import { PITCH_AUDIO_READY_EVENT } from './pitchAudio'

/**
 * Persistent ambience sources are rebuilt after Web Audio really becomes usable.
 * This covers both fresh-load autoplay gating and tab/background resume without
 * asking the user to cycle the Sound control.
 */
export function usePitchAudioReadyNonce() {
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const bump = () => setNonce((value) => value + 1)
    window.addEventListener(PITCH_AUDIO_READY_EVENT, bump)
    return () => window.removeEventListener(PITCH_AUDIO_READY_EVENT, bump)
  }, [])

  return nonce
}
