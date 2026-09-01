import { useEffect, useRef, type CSSProperties } from 'react'
import { getPitchAudio, getPitchAudioTransientOutput } from '../audio/pitchAudio'
import { clearAmbientTrain, publishAmbientTrain } from '../world/ambientLifeSignal'
import type { AlivePhase, AmbientLifeEvent, AmbientLifeEventKind } from './useAliveWorld'

type AmbientLifeLayerProps = {
  event: AmbientLifeEvent
  soundOn: boolean
  phase?: AlivePhase
  onComplete?: (kind: AmbientLifeEventKind, id: number) => void
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothStep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function seeded(seed: number) {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return n - Math.floor(n)
}

function Airplane({ event }: { event: AmbientLifeEvent }) {
  const direction = event.direction ?? 1
  const duration = event.duration ?? 190_000
  const startY = event.startY ?? 14
  const travelY = event.travelY ?? 4
  const startScale = event.startScale ?? 0.78
  const endScale = event.endScale ?? 1.02

  return (
    <div
      className={`ambient-airplane ${direction < 0 ? 'from-right' : 'from-left'}`}
      style={{
        '--life-plane-y': `${startY}vh`,
        '--life-plane-dy': `${travelY}vh`,
        '--life-plane-duration': `${duration}ms`,
        '--life-plane-scale-start': `${startScale}`,
        '--life-plane-scale-end': `${endScale}`,
      } as CSSProperties}
      aria-hidden="true"
    >
      <i className="ambient-airplane-red" />
      <i className="ambient-airplane-green" />
      <i className="ambient-airplane-strobe" />
    </div>
  )
}

function weatherVisibility(phase?: AlivePhase) {
  if (phase === 'storm') return 0
  if (phase === 'rain') return 0.62
  if (phase === 'rain-front') return 0.76
  if (phase === 'snow') return 0.88
  if (phase === 'cold-front') return 0.92
  if (phase === 'clearing') return 0.96
  return 1
}

/**
 * The train itself is painted into WorldBaseScene's existing canvas. This component
 * only publishes a tiny animation signal, avoiding the previous extra full-screen
 * high-DPR canvas for a rare object occupying a few hundred pixels.
 */
function Train({ event, phase }: { event: AmbientLifeEvent; phase?: AlivePhase }) {
  const eventRef = useRef(event)
  const phaseRef = useRef(phase)

  useEffect(() => {
    eventRef.current = event
  }, [event])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const initial = eventRef.current
    const duration = initial.duration ?? 92_000
    const direction = initial.direction ?? 1
    const startY = (initial.startY ?? 80.0) / 100
    const travelY = (initial.travelY ?? -3.6) / 100
    const startScale = initial.startScale ?? 1.05
    const endScale = initial.endScale ?? 0.76
    const startedAt = performance.now()
    let raf = 0
    let lastPublished = 0

    const frame = (time: number) => {
      const progress = clamp01((time - startedAt) / duration)

      // Signal updates at ~30 Hz; WorldBaseScene already paints at the same rate.
      if (time - lastPublished >= 30 || progress >= 1) {
        lastPublished = time
        const travel = smoothStep(progress)
        const width = window.innerWidth
        const startX = direction > 0 ? -width * 0.20 : width * 1.20
        const endX = direction > 0 ? width * 1.04 : -width * 0.04
        const x = startX + (endX - startX) * travel
        const scale = startScale * Math.pow(endScale / startScale, progress)
        const fadeIn = smoothStep(progress / 0.045)
        const fadeOut = 1 - smoothStep((progress - 0.90) / 0.10)
        const distanceFade = 1 - progress * 0.24
        const alpha = fadeIn * fadeOut * distanceFade * weatherVisibility(phaseRef.current)

        publishAmbientTrain(
          initial.id,
          progress,
          direction,
          alpha,
          x,
          scale,
          startY,
          travelY,
          startScale,
          endScale,
        )
      }

      if (progress >= 1) {
        clearAmbientTrain()
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      clearAmbientTrain()
    }
  }, [event.id])

  return null
}

function useTrainAudio(event: AmbientLifeEvent, soundOn: boolean) {
  const { kind, id, duration = 92_000, horn = false, hornDelay } = event

  useEffect(() => {
    if (kind !== 'train' || !soundOn) return
    const audioCtx = getPitchAudio()
    if (!audioCtx) return
    const output = getPitchAudioTransientOutput(audioCtx)
    const durationSeconds = duration / 1000
    let disposed = false
    let railTimer = 0
    let hornTimer = 0

    // A low, narrow rolling bed: clearly audible in a quiet room, but still far
    // below the level of full rain/snow ambience.
    const bufferLength = Math.max(1, Math.floor(audioCtx.sampleRate * 2.2))
    const buffer = audioCtx.createBuffer(1, bufferLength, audioCtx.sampleRate)
    const data = buffer.getChannelData(0)
    let brown = 0
    for (let i = 0; i < bufferLength; i += 1) {
      const white = Math.random() * 2 - 1
      brown = (brown + 0.022 * white) / 1.022
      data[i] = brown * 2.6
    }

    const bed = audioCtx.createBufferSource()
    const low = audioCtx.createBiquadFilter()
    const band = audioCtx.createBiquadFilter()
    const bedGain = audioCtx.createGain()
    bed.buffer = buffer
    bed.loop = true
    low.type = 'lowpass'
    low.frequency.value = 900
    low.Q.value = 0.25
    band.type = 'bandpass'
    band.frequency.value = 290
    band.Q.value = 0.48
    bedGain.gain.value = 0.0001
    bed.connect(low).connect(band).connect(bedGain).connect(output)

    const now = audioCtx.currentTime
    bedGain.gain.setValueAtTime(0.0001, now)
    bedGain.gain.linearRampToValueAtTime(0.0068, now + Math.min(3.2, durationSeconds * 0.08))
    bedGain.gain.setValueAtTime(0.0068, now + durationSeconds * 0.30)
    bedGain.gain.exponentialRampToValueAtTime(0.00115, now + Math.max(4, durationSeconds - 1.2))
    bed.start()

    const railTick = () => {
      if (disposed || audioCtx.state === 'closed') return
      const tickNow = audioCtx.currentTime
      for (let hit = 0; hit < 2; hit += 1) {
        const osc = audioCtx.createOscillator()
        const filter = audioCtx.createBiquadFilter()
        const gain = audioCtx.createGain()
        const start = tickNow + hit * (0.115 + Math.random() * 0.035)
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(148 + Math.random() * 34, start)
        osc.frequency.exponentialRampToValueAtTime(78 + Math.random() * 18, start + 0.060)
        filter.type = 'lowpass'
        filter.frequency.value = 560
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.0048 + Math.random() * 0.0018, start + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.082)
        osc.connect(filter).connect(gain).connect(output)
        osc.start(start)
        osc.stop(start + 0.10)
      }
      railTimer = window.setTimeout(railTick, 1_050 + Math.random() * 780)
    }
    railTimer = window.setTimeout(railTick, 650 + Math.random() * 700)

    if (horn) {
      const delay = hornDelay ?? Math.max(8_000, durationSeconds * (0.42 + seeded(id + 44.1) * 0.16) * 1000)
      hornTimer = window.setTimeout(() => {
        if (disposed || audioCtx.state === 'closed') return
        const hornNow = audioCtx.currentTime
        const hornGain = audioCtx.createGain()
        const hornFilter = audioCtx.createBiquadFilter()
        hornFilter.type = 'lowpass'
        hornFilter.frequency.value = 820
        hornGain.gain.setValueAtTime(0.0001, hornNow)
        hornGain.gain.exponentialRampToValueAtTime(0.0082, hornNow + 0.55)
        hornGain.gain.setTargetAtTime(0.0062, hornNow + 0.90, 0.38)
        hornGain.gain.exponentialRampToValueAtTime(0.0001, hornNow + 4.25)
        hornFilter.connect(hornGain).connect(output)

        const tones = [174, 232]
        tones.forEach((frequency, index) => {
          const osc = audioCtx.createOscillator()
          osc.type = index === 0 ? 'sine' : 'triangle'
          osc.frequency.value = frequency
          osc.detune.value = index === 0 ? -4 : 5
          osc.connect(hornFilter)
          osc.start(hornNow)
          osc.stop(hornNow + 4.45)
        })
      }, delay)
    }

    return () => {
      disposed = true
      window.clearTimeout(railTimer)
      window.clearTimeout(hornTimer)
      try { bed.stop() } catch { /* already stopped */ }
      try { bed.disconnect() } catch { /* harmless */ }
      try { low.disconnect() } catch { /* harmless */ }
      try { band.disconnect() } catch { /* harmless */ }
      try { bedGain.disconnect() } catch { /* harmless */ }
    }
  }, [duration, horn, hornDelay, id, kind, soundOn])
}

export function AmbientLifeLayer({ event, soundOn, phase, onComplete }: AmbientLifeLayerProps) {
  useTrainAudio(event, soundOn)

  useEffect(() => {
    const duration = event.duration ?? (event.kind === 'train' ? 92_000 : 190_000)
    const timer = window.setTimeout(() => onComplete?.(event.kind, event.id), duration + 250)
    return () => window.clearTimeout(timer)
  }, [event, onComplete])

  if (event.kind === 'train') return <Train event={event} phase={phase} />
  return <Airplane event={event} />
}
