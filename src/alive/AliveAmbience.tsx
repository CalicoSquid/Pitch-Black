import { useEffect, useRef } from 'react'
import { loadPitchAudioAsset } from '../audio/audioAssets'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import type { AlivePhase } from './useAliveWorld'

function nightLevel(phase: AlivePhase) {
  if (phase === 'calm') return 0.045
  if (phase === 'clearing') return 0.026
  if (phase === 'rain-front') return 0.008
  return 0
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/**
 * TQW is quiet first. The real insect recording is now treated as a passing
 * natural texture rather than a permanent primary soundtrack: long low-presence
 * stretches alternate with gentle, restrained insect windows. Foreground events
 * duck it further so ambience never fights the thing the user is noticing.
 */
export function AliveAmbience({
  active,
  soundOn,
  phase,
  foregroundActive = false,
}: {
  active: boolean
  soundOn: boolean
  phase: AlivePhase
  foregroundActive?: boolean
}) {
  const phaseRef = useRef(phase)
  const foregroundRef = useRef(foregroundActive)
  const phaseGainRef = useRef<GainNode | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  phaseRef.current = phase
  foregroundRef.current = foregroundActive

  useEffect(() => {
    const audioCtx = contextRef.current
    const phaseGain = phaseGainRef.current
    if (!audioCtx || !phaseGain) return

    const duck = foregroundActive ? 0.18 : 1
    const target = active && soundOn ? nightLevel(phase) * duck : 0
    phaseGain.gain.cancelScheduledValues(audioCtx.currentTime)
    phaseGain.gain.setTargetAtTime(target, audioCtx.currentTime, foregroundActive ? 0.7 : 1.7)
  }, [active, foregroundActive, phase, soundOn])

  useEffect(() => {
    if (!active || !soundOn) return

    const audioCtx = getPitchAudio()
    if (!audioCtx) return

    let disposed = false
    let source: AudioBufferSourceNode | null = null
    let phaseGain: GainNode | null = null
    let presenceGain: GainNode | null = null
    let presenceTimer = 0

    const schedulePresenceCycle = (startQuiet: boolean) => {
      if (disposed || !presenceGain || audioCtx.state === 'closed') return

      const now = audioCtx.currentTime
      const quietTarget = randomBetween(0.08, 0.15)
      const presentTarget = randomBetween(0.28, 0.54)

      if (startQuiet) {
        const fadeSeconds = randomBetween(7, 13)
        presenceGain.gain.cancelScheduledValues(now)
        presenceGain.gain.setTargetAtTime(quietTarget, now, fadeSeconds / 3.2)
        const quietMs = randomBetween(35_000, 85_000)
        presenceTimer = window.setTimeout(() => schedulePresenceCycle(false), quietMs)
        return
      }

      const fadeSeconds = randomBetween(7, 12)
      presenceGain.gain.cancelScheduledValues(now)
      presenceGain.gain.setTargetAtTime(presentTarget, now, fadeSeconds / 3.2)
      const presentMs = randomBetween(18_000, 36_000)
      presenceTimer = window.setTimeout(() => schedulePresenceCycle(true), presentMs)
    }

    void loadPitchAudioAsset(audioCtx, 'night-ambience-loop.mp3')
      .then((buffer) => {
        if (disposed || audioCtx.state === 'closed') return

        source = audioCtx.createBufferSource()
        presenceGain = audioCtx.createGain()
        phaseGain = audioCtx.createGain()
        source.buffer = buffer
        source.loop = true
        source.loopStart = 0
        source.loopEnd = buffer.duration
        presenceGain.gain.value = 0.20
        phaseGain.gain.value = 0
        source.connect(presenceGain).connect(phaseGain).connect(getPitchAudioOutput(audioCtx))

        contextRef.current = audioCtx
        phaseGainRef.current = phaseGain

        const now = audioCtx.currentTime
        const duck = foregroundRef.current ? 0.18 : 1
        phaseGain.gain.setValueAtTime(0, now)
        phaseGain.gain.setTargetAtTime(nightLevel(phaseRef.current) * duck, now, 1.8)
        presenceGain.gain.setValueAtTime(0.22, now)
        source.onended = () => {
          try { source?.disconnect() } catch { /* harmless */ }
          try { presenceGain?.disconnect() } catch { /* harmless */ }
          try { phaseGain?.disconnect() } catch { /* harmless */ }
        }
        source.start(now, Math.random() * Math.max(0.01, buffer.duration - 0.01))

        // Start audible enough to confirm the bed exists, then spend most of its
        // life drifting between very low and modest presence.
        presenceTimer = window.setTimeout(() => schedulePresenceCycle(true), randomBetween(18_000, 30_000))
      })
      .catch(() => {
        // A failed optional ambience asset should never break the world.
      })

    return () => {
      disposed = true
      window.clearTimeout(presenceTimer)
      if (phaseGainRef.current === phaseGain) phaseGainRef.current = null
      if (contextRef.current === audioCtx) contextRef.current = null

      if (!source || !phaseGain || audioCtx.state === 'closed') return
      const now = audioCtx.currentTime
      phaseGain.gain.cancelScheduledValues(now)
      phaseGain.gain.setTargetAtTime(0, now, 0.42)
      try { source.stop(now + 1.8) } catch { /* already stopped */ }
    }
  }, [active, soundOn])

  return null
}
