import { useEffect, useRef } from 'react'
import { loadPitchAudioAsset } from '../audio/audioAssets'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { usePitchAudioReadyNonce } from '../audio/usePitchAudioReadyNonce'
import type { AlivePhase } from './useAliveWorld'

function nightLevel(phase: AlivePhase) {
  if (phase === 'calm') return 0.26
  if (phase === 'clearing') return 0.18
  if (phase === 'rain-front') return 0.055
  return 0
}

/**
 * TQW is quiet first. The real insect recording is a stable, subordinate night
 * texture. The field bed stays audible at low listening levels without competing
 * with weather. Visual micro-events must never alter it: if the ambience pumps when a
 * meteor/halo appears, the sound becomes an accidental event announcement.
 */
export function AliveAmbience({
  active,
  soundOn,
  phase,
}: {
  active: boolean
  soundOn: boolean
  phase: AlivePhase
}) {
  const audioReadyNonce = usePitchAudioReadyNonce()
  const sourceEnabled = active && soundOn && nightLevel(phase) > 0.001
  const phaseRef = useRef(phase)
  const phaseGainRef = useRef<GainNode | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    const audioCtx = contextRef.current
    const phaseGain = phaseGainRef.current
    if (!audioCtx || !phaseGain) return

    const target = active && soundOn ? nightLevel(phase) : 0
    phaseGain.gain.cancelScheduledValues(audioCtx.currentTime)
    phaseGain.gain.setTargetAtTime(target, audioCtx.currentTime, 1.7)
  }, [active, phase, soundOn])

  useEffect(() => {
    if (!sourceEnabled) return

    const audioCtx = getPitchAudio()
    if (!audioCtx) return

    let disposed = false
    let source: AudioBufferSourceNode | null = null
    let phaseGain: GainNode | null = null
    let presenceGain: GainNode | null = null

    void loadPitchAudioAsset(audioCtx, 'night-ambience-crickets-v2.mp3')
      .then((buffer) => {
        if (disposed || audioCtx.state !== 'running') return

        source = audioCtx.createBufferSource()
        presenceGain = audioCtx.createGain()
        phaseGain = audioCtx.createGain()
        source.buffer = buffer
        source.loop = true
        source.loopStart = 0
        source.loopEnd = buffer.duration
        presenceGain.gain.value = 0.24
        phaseGain.gain.value = 0
        source.connect(presenceGain).connect(phaseGain).connect(getPitchAudioOutput(audioCtx))

        contextRef.current = audioCtx
        phaseGainRef.current = phaseGain

        const now = audioCtx.currentTime
        phaseGain.gain.setValueAtTime(0, now)
        phaseGain.gain.setTargetAtTime(nightLevel(phaseRef.current), now, 1.8)
        presenceGain.gain.setValueAtTime(0.24, now)
        source.onended = () => {
          try { source?.disconnect() } catch { /* harmless */ }
          try { presenceGain?.disconnect() } catch { /* harmless */ }
          try { phaseGain?.disconnect() } catch { /* harmless */ }
        }
        source.start(now, Math.random() * Math.max(0.01, buffer.duration - 0.01))

      })
      .catch(() => {
        // A failed optional ambience asset should never break the world.
      })

    return () => {
      disposed = true
      if (phaseGainRef.current === phaseGain) phaseGainRef.current = null
      if (contextRef.current === audioCtx) contextRef.current = null

      if (!source || !phaseGain) return
      if (audioCtx.state !== 'running') {
        try { source.stop() } catch { /* already stopped */ }
        source.disconnect()
        presenceGain?.disconnect()
        phaseGain.disconnect()
        return
      }
      const now = audioCtx.currentTime
      phaseGain.gain.cancelScheduledValues(now)
      phaseGain.gain.setTargetAtTime(0, now, 0.42)
      try { source.stop(now + 1.8) } catch { /* already stopped */ }
    }
  }, [sourceEnabled, audioReadyNonce])

  return null
}
