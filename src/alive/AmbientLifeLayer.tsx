import { useEffect, useRef, type CSSProperties } from 'react'
import { loadPitchAudioAsset } from '../audio/audioAssets'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
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

    const output = getPitchAudioOutput(audioCtx)
    const durationSeconds = duration / 1000
    let disposed = false
    let hornTimer = 0
    let bedSource: AudioBufferSourceNode | null = null
    let bedGain: GainNode | null = null
    let hornSource: AudioBufferSourceNode | null = null
    let hornGain: GainNode | null = null

    const disconnectBed = () => {
      try { bedSource?.disconnect() } catch { /* harmless */ }
      try { bedGain?.disconnect() } catch { /* harmless */ }
    }

    void loadPitchAudioAsset(audioCtx, 'distant-train-bed.mp3')
      .then((buffer) => {
        if (disposed || audioCtx.state === 'closed') return

        bedSource = audioCtx.createBufferSource()
        bedGain = audioCtx.createGain()
        bedSource.buffer = buffer
        bedSource.loop = false
        bedSource.connect(bedGain).connect(output)
        bedSource.onended = disconnectBed

        const now = audioCtx.currentTime
        const fadeInEnd = now + Math.min(4.5, durationSeconds * 0.09)
        const fadeOutStart = now + Math.max(5, durationSeconds - 7)
        const audibleSeconds = Math.min(durationSeconds, Math.max(1, buffer.duration - 0.08))
        const end = now + audibleSeconds
        bedGain.gain.setValueAtTime(0, now)
        bedGain.gain.linearRampToValueAtTime(0.18, fadeInEnd)
        bedGain.gain.setValueAtTime(0.18, fadeOutStart)
        bedGain.gain.linearRampToValueAtTime(0, end)
        bedSource.start(now)
        bedSource.stop(end + 0.15)
      })
      .catch(() => {
        // The visual event should continue even if an optional recording fails.
      })

    if (horn) {
      const delay = hornDelay ?? Math.max(8_000, duration * 0.44)
      const hornBuffer = loadPitchAudioAsset(audioCtx, 'distant-train-horn.mp3')
      hornTimer = window.setTimeout(() => {
        void hornBuffer
          .then((buffer) => {
            if (disposed || audioCtx.state === 'closed') return

            hornSource = audioCtx.createBufferSource()
            hornGain = audioCtx.createGain()
            hornSource.buffer = buffer
            hornGain.gain.value = 0.30
            hornSource.connect(hornGain).connect(output)
            hornSource.onended = () => {
              try { hornSource?.disconnect() } catch { /* harmless */ }
              try { hornGain?.disconnect() } catch { /* harmless */ }
            }
            hornSource.start()
          })
          .catch(() => {
            // No synthetic fallback: silence is better than an artificial horn.
          })
      }, delay)
    }

    return () => {
      disposed = true
      window.clearTimeout(hornTimer)
      try { bedSource?.stop() } catch { /* already stopped */ }
      try { hornSource?.stop() } catch { /* already stopped */ }
      disconnectBed()
      try { hornSource?.disconnect() } catch { /* harmless */ }
      try { hornGain?.disconnect() } catch { /* harmless */ }
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
