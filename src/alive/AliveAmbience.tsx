import { useEffect } from 'react'
import { getPitchAudio, getPitchAudioOutput, getPitchAudioTransientOutput } from '../audio/pitchAudio'
import type { AlivePhase } from './useAliveWorld'

function between(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function cricketsBelongHere(phase: AlivePhase) {
  return phase === 'calm' || phase === 'clearing' || phase === 'rain-front'
}

export function AliveAmbience({ active, soundOn, phase }: { active: boolean; soundOn: boolean; phase: AlivePhase }) {
  useEffect(() => {
    if (!active || !soundOn || !cricketsBelongHere(phase)) return

    const audioCtx = getPitchAudio()
    if (!audioCtx) return

    const output = getPitchAudioOutput(audioCtx)
    let disposed = false
    let chirpTimer = 0

    // A nearly subliminal bed of filtered night air prevents truly silent gaps.
    const length = Math.max(1, Math.floor(audioCtx.sampleRate * 2.4))
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate)
    const data = buffer.getChannelData(0)
    let brown = 0
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      brown = (brown + 0.022 * white) / 1.022
      data[i] = brown * 2.8
    }

    const bed = audioCtx.createBufferSource()
    const bedFilter = audioCtx.createBiquadFilter()
    const bedGain = audioCtx.createGain()
    bed.buffer = buffer
    bed.loop = true
    bedFilter.type = 'bandpass'
    bedFilter.frequency.value = 1550
    bedFilter.Q.value = 0.42
    bedGain.gain.value = 0.0032
    bed.connect(bedFilter).connect(bedGain).connect(output)
    bed.start()

    const playCricket = () => {
      if (disposed || audioCtx.state === 'closed') return
      const now = audioCtx.currentTime
      const pulses = 3 + Math.floor(Math.random() * 3)
      const baseFrequency = between(3100, 4250)
      const spacing = between(0.055, 0.085)

      for (let pulse = 0; pulse < pulses; pulse += 1) {
        const start = now + pulse * spacing
        const oscillator = audioCtx.createOscillator()
        const filter = audioCtx.createBiquadFilter()
        const gain = audioCtx.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(baseFrequency * between(0.96, 1.04), start)
        oscillator.frequency.exponentialRampToValueAtTime(baseFrequency * between(1.02, 1.08), start + 0.032)
        filter.type = 'bandpass'
        filter.frequency.value = baseFrequency
        filter.Q.value = 4.5
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(between(0.007, 0.012), start + 0.009)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045)
        oscillator.connect(filter).connect(gain).connect(getPitchAudioTransientOutput(audioCtx))
        oscillator.start(start)
        oscillator.stop(start + 0.055)
      }
    }

    const scheduleCricket = (first = false) => {
      const delay = first ? between(1100, 3200) : between(2500, 7600)
      chirpTimer = window.setTimeout(() => {
        if (disposed) return
        playCricket()
        scheduleCricket()
      }, delay)
    }

    scheduleCricket(true)

    return () => {
      disposed = true
      window.clearTimeout(chirpTimer)
      try { bed.stop() } catch { /* already stopped */ }
      try { bed.disconnect() } catch { /* harmless */ }
      try { bedFilter.disconnect() } catch { /* harmless */ }
      try { bedGain.disconnect() } catch { /* harmless */ }
    }
  }, [active, soundOn, phase])

  return null
}
