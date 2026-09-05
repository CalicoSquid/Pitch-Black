import { useEffect, useRef, type CSSProperties } from 'react'
import { loadPitchAudioAsset } from '../audio/audioAssets'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { usePitchAudioReadyNonce } from '../audio/usePitchAudioReadyNonce'
import {
  ambientInteractionSignal,
  clearAmbientLantern,
  clearAmbientTrain,
  publishAmbientLantern,
  publishAmbientTrain,
} from '../world/ambientLifeSignal'
import { lightningIgnitionSignal } from '../world/lightningSignal'
import { pitchWorld, worldIndexAt } from '../world/worldState'
import type { AlivePhase, AmbientLifeEvent, AmbientLifeEventKind } from './useAliveWorld'

type AmbientLifeLayerProps = {
  event: AmbientLifeEvent
  soundOn: boolean
  phase?: AlivePhase
  onComplete?: (kind: AmbientLifeEventKind, id: number) => void
  testReaction?: 'owl' | 'lightning'
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

function lanternWeatherVisibility(phase?: AlivePhase) {
  if (phase === 'storm') return 0.56
  if (phase === 'rain') return 0.70
  if (phase === 'rain-front') return 0.82
  if (phase === 'snow') return 0.90
  if (phase === 'cold-front') return 0.94
  if (phase === 'clearing') return 0.97
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

function Lantern({
  event,
  phase,
  onComplete,
  testReaction,
}: {
  event: AmbientLifeEvent
  phase?: AlivePhase
  onComplete?: (kind: AmbientLifeEventKind, id: number) => void
  testReaction?: 'owl' | 'lightning'
}) {
  const eventRef = useRef(event)
  const phaseRef = useRef(phase)
  const testReactionRef = useRef(testReaction)

  useEffect(() => {
    eventRef.current = event
  }, [event])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    testReactionRef.current = testReaction
  }, [testReaction])

  useEffect(() => {
    const initial = eventRef.current
    const duration = initial.duration ?? 148_000
    const direction = initial.direction ?? 1
    const startScale = initial.startScale ?? 0.98
    const endScale = initial.endScale ?? 1.03
    const seed = initial.id * 0.417 + direction * 0.31
    const totalSteps = 88 + Math.floor(seeded(seed + 8.2) * 18)

    // Keep the approved uneven natural walk intact. Reactions only take over once
    // something in the world actually interrupts the crossing.
    const stepDurations = new Float64Array(totalSteps)
    const stepStrides = new Float64Array(totalSteps)
    const cumulativeTime = new Float64Array(totalSteps + 1)
    const cumulativeDistance = new Float64Array(totalSteps + 1)
    let totalStepTime = 0
    let totalStepDistance = 0

    for (let i = 0; i < totalSteps; i += 1) {
      const pairBias = Math.sin((i * 0.5 + seed) * 1.37) * 0.055
      const randomTime = (seeded(seed + i * 3.71 + 10.2) - 0.5) * 0.24
      const randomStride = (seeded(seed + i * 5.13 + 17.8) - 0.5) * 0.20
      const occasionalCheck = seeded(seed + i * 7.91 + 23.4)
      const checkSlowdown = occasionalCheck > 0.93 ? 0.20 + seeded(seed + i * 2.17 + 31.0) * 0.16 : 0
      const shortStep = occasionalCheck < 0.055 ? 0.12 + seeded(seed + i * 4.33 + 41.0) * 0.12 : 0

      stepDurations[i] = Math.max(0.68, 1 + pairBias + randomTime + checkSlowdown)
      stepStrides[i] = Math.max(0.72, 1 + pairBias * 0.45 + randomStride - shortStep)
      totalStepTime += stepDurations[i]
      totalStepDistance += stepStrides[i]
      cumulativeTime[i + 1] = totalStepTime
      cumulativeDistance[i + 1] = totalStepDistance
    }

    const pauseAStart = 0.24 + seeded(seed + 2.1) * 0.13
    const pauseBStart = 0.58 + seeded(seed + 4.9) * 0.13
    const pauseADuration = 0.008 + seeded(seed + 5.7) * 0.012
    const pauseBDuration = 0.006 + seeded(seed + 6.3) * 0.014
    const totalPaused = pauseADuration + pauseBDuration
    const startedAt = performance.now()
    let raf = 0
    let lastPublished = 0
    let lastX = direction > 0 ? -window.innerWidth * 0.065 : window.innerWidth * 1.065
    let lastStepIndex = 0
    let lastRenderDirection = direction
    let seenOwlHootVersion = ambientInteractionSignal.owlHootVersion
    let seenIgnitionVersion = lightningIgnitionSignal.version
    let reaction: 'none' | 'panic' | 'fire-turning' | 'fire-running' | 'fire-trapped' = 'none'
    let reactionStartedAt = 0
    let reactionStartX = lastX
    let reactionStartStepIndex = 0
    let fireEscapeDirection = direction
    let fireTurnFromDirection = direction
    let lastFireAssessmentAt = 0
    const fireSources: number[] = []
    let testReactionConsumed = false
    let completed = false

    const consumedPause = (progress: number, pauseStart: number, pauseDuration: number) => (
      Math.min(pauseDuration, Math.max(0, progress - pauseStart))
    )

    const finish = () => {
      if (completed) return
      completed = true
      clearAmbientLantern()
      onComplete?.('lantern', initial.id)
    }

    const naturalWalkAt = (progress: number, width: number) => {
      const startX = direction > 0 ? -width * 0.065 : width * 1.065
      const endX = direction > 0 ? width * 1.035 : -width * 0.035
      const pausedA = consumedPause(progress, pauseAStart, pauseADuration)
      const pausedB = consumedPause(progress, pauseBStart, pauseBDuration)
      const walkingProgress = clamp01((progress - pausedA - pausedB) / Math.max(0.001, 1 - totalPaused))
      const targetStepTime = walkingProgress * totalStepTime

      let stepIndex = 0
      while (stepIndex < totalSteps - 1 && cumulativeTime[stepIndex + 1] <= targetStepTime) stepIndex += 1

      const localTime = targetStepTime - cumulativeTime[stepIndex]
      const stepPhase = progress >= 1 ? 1 : clamp01(localTime / Math.max(0.001, stepDurations[stepIndex]))
      const stride = stepStrides[stepIndex]
      const speedPulse = 0.34 + seeded(seed + stepIndex * 6.17 + 51.4) * 0.24
      const asymmetry = (seeded(seed + stepIndex * 4.91 + 62.8) - 0.5) * 0.035
      const warpedPhase = clamp01(
        stepPhase
        - Math.sin(stepPhase * Math.PI * 2) * speedPulse / (Math.PI * 2)
        + Math.sin(stepPhase * Math.PI) * asymmetry,
      )
      const travelled = cumulativeDistance[stepIndex] + stride * warpedPhase
      const travel = clamp01(travelled / Math.max(0.001, totalStepDistance))
      const x = startX + (endX - startX) * travel
      const inPauseA = progress >= pauseAStart && progress < pauseAStart + pauseADuration
      const inPauseB = progress >= pauseBStart && progress < pauseBStart + pauseBDuration

      return { x, stepPhase, stepIndex, walking: !(inPauseA || inPauseB) }
    }

    const reactionGait = (elapsed: number, fast: boolean) => {
      const baseStepMs = fast ? 285 : 470
      const cycle = Math.max(0, elapsed) / baseStepMs
      const irregular = cycle + Math.sin(cycle * 1.73 + seed) * (fast ? 0.055 : 0.045)
      const whole = Math.max(0, Math.floor(irregular))
      return {
        stepIndex: reactionStartStepIndex + whole,
        stepPhase: clamp01(irregular - whole),
      }
    }

    const fireStillActiveAt = (sourceX: number, width: number) => {
      if (pitchWorld.ember.length < 3 || width <= 0) return false
      const idx = worldIndexAt(sourceX, width)
      for (let offset = -5; offset <= 5; offset += 1) {
        const i = idx + offset
        if (i < 0 || i >= pitchWorld.ember.length) continue
        if (pitchWorld.ember[i] > 0.085) return true
      }
      return false
    }

    const pruneFireSources = (width: number) => {
      for (let i = fireSources.length - 1; i >= 0; i -= 1) {
        if (!fireStillActiveAt(fireSources[i], width)) fireSources.splice(i, 1)
      }
    }

    const rememberFire = (x: number, width: number) => {
      const duplicateRadius = Math.max(18, width * 0.022)
      if (!fireSources.some((existing) => Math.abs(existing - x) <= duplicateRadius)) fireSources.push(x)
      pruneFireSources(width)
    }

    const chooseFireEscapeDirection = (width: number, latestFireX?: number) => {
      pruneFireSources(width)
      const sideGap = Math.max(5, width * 0.006)
      let fireLeft = false
      let fireRight = false
      let fireClose = false
      for (const sourceX of fireSources) {
        if (sourceX < lastX - sideGap) fireLeft = true
        else if (sourceX > lastX + sideGap) fireRight = true
        else fireClose = true
      }

      // Distinct fires on both routes are the only true trap. A single strike
      // right beside/under the walker should make them flee, not freeze in it.
      if (fireLeft && fireRight) return 0
      if (fireLeft) return 1
      if (fireRight) return -1
      if (fireClose) {
        if (typeof latestFireX === 'number' && Math.abs(latestFireX - lastX) > 0.5) {
          return latestFireX < lastX ? 1 : -1
        }
        return lastRenderDirection
      }
      return null
    }

    const beginFireDecision = (time: number, width: number, latestFireX?: number) => {
      if (reaction === 'panic') return
      if (typeof latestFireX === 'number') rememberFire(latestFireX, width)

      let escapeDirection = chooseFireEscapeDirection(width, latestFireX)
      if (escapeDirection === null && typeof latestFireX === 'number') {
        escapeDirection = latestFireX < lastX ? 1 : -1
      }

      reactionStartedAt = time
      reactionStartX = lastX
      reactionStartStepIndex = lastStepIndex
      lastFireAssessmentAt = time

      if (escapeDirection === 0) {
        reaction = 'fire-trapped'
        return
      }

      if (escapeDirection === null) {
        // The flames have already died below the meaningful threshold. Keep moving
        // rather than reacting to a consequence that is no longer there.
        reaction = 'none'
        return
      }

      fireEscapeDirection = escapeDirection
      fireTurnFromDirection = lastRenderDirection
      reaction = fireEscapeDirection === lastRenderDirection ? 'fire-running' : 'fire-turning'
    }

    const startOwlPanic = (time: number) => {
      if (reaction !== 'none') return
      reactionStartedAt = time
      reactionStartX = lastX
      reactionStartStepIndex = lastStepIndex
      reaction = 'panic'
    }

    const frame = (time: number) => {
      if (completed) return
      const progress = clamp01((time - startedAt) / duration)

      if (time - lastPublished >= 30 || progress >= 1) {
        lastPublished = time
        const width = window.innerWidth
        const natural = naturalWalkAt(progress, width)
        if (reaction === 'none') {
          lastX = natural.x
          lastStepIndex = natural.stepIndex
          lastRenderDirection = direction
        }

        const owlVersion = ambientInteractionSignal.owlHootVersion
        if (reaction === 'none' && owlVersion !== seenOwlHootVersion) startOwlPanic(time)
        seenOwlHootVersion = owlVersion

        const ignitionVersion = lightningIgnitionSignal.version
        if (ignitionVersion !== seenIgnitionVersion) {
          if (reaction !== 'panic') beginFireDecision(time, width, lightningIgnitionSignal.x)
          seenIgnitionVersion = ignitionVersion
        }

        if (!testReactionConsumed && reaction === 'none' && progress >= 0.28 && testReactionRef.current) {
          testReactionConsumed = true
          if (testReactionRef.current === 'owl') startOwlPanic(time)
          else beginFireDecision(time, width, lastX + direction * width * 0.12)
        }

        // A boxed-in walker keeps checking the actual persistent fire field. Rain
        // or snow may extinguish one source and open a route without another strike.
        if (reaction === 'fire-trapped' && time - lastFireAssessmentAt >= 260) {
          lastFireAssessmentAt = time
          const escapeDirection = chooseFireEscapeDirection(width)
          if (escapeDirection !== 0 && escapeDirection !== null) beginFireDecision(time, width)
        }

        let x = natural.x
        let renderDirection = direction
        let stepPhase = natural.stepPhase
        let stepIndex = natural.stepIndex
        let walking = natural.walking
        let reactionLabel: 'none' | 'panic' | 'turning' | 'returning' = 'none'
        let reactionFade = 1

        if (reaction === 'panic') {
          // Owl behavior is deliberately untouched: this is the accepted comedy beat.
          const elapsed = time - reactionStartedAt
          const startleMs = 520
          reactionLabel = 'panic'
          if (elapsed < startleMs) {
            const startle = smoothStep(elapsed / startleMs)
            x = reactionStartX - direction * Math.sin(startle * Math.PI) * 2.4
            walking = false
            stepPhase = 0.5
            stepIndex = reactionStartStepIndex
          } else {
            const runElapsed = elapsed - startleMs
            const exitX = direction > 0 ? width * 1.055 : -width * 0.055
            const distanceFraction = Math.min(1.2, Math.abs(exitX - reactionStartX) / Math.max(1, width))
            const runDuration = 6_800 + distanceFraction * 5_200
            const p = clamp01(runElapsed / runDuration)
            const uneven = clamp01(p - Math.sin(p * Math.PI * 18 + seed) * 0.006 * (1 - p))
            const travel = 1 - Math.pow(1 - uneven, 1.22)
            x = reactionStartX + (exitX - reactionStartX) * travel
            const gait = reactionGait(runElapsed, true)
            stepPhase = gait.stepPhase
            stepIndex = gait.stepIndex
            walking = true
            reactionFade = 1 - smoothStep((p - 0.90) / 0.10)
            if (p >= 1) {
              finish()
              return
            }
          }
        } else if (reaction === 'fire-turning') {
          const elapsed = time - reactionStartedAt
          const turnMs = 920
          reactionLabel = 'turning'
          if (elapsed < turnMs) {
            const turn = smoothStep(elapsed / turnMs)
            x = reactionStartX + fireTurnFromDirection * Math.sin(turn * Math.PI) * 1.6
            renderDirection = turn < 0.48 ? fireTurnFromDirection : fireEscapeDirection
            walking = false
            stepPhase = 0.5
            stepIndex = reactionStartStepIndex
          } else {
            // Finish the turn in place; do not snap back to wherever the untouched
            // natural crossing would have reached while the walker was stopped.
            x = reactionStartX
            renderDirection = fireEscapeDirection
            reaction = 'fire-running'
            reactionStartedAt = time
            reactionStartX = x
            reactionStartStepIndex = stepIndex
            fireTurnFromDirection = fireEscapeDirection
          }
        } else if (reaction === 'fire-running') {
          const elapsed = time - reactionStartedAt
          reactionLabel = 'returning'
          renderDirection = fireEscapeDirection
          const exitX = fireEscapeDirection > 0 ? width * 1.055 : -width * 0.055
          const distanceFraction = Math.min(1.2, Math.abs(exitX - reactionStartX) / Math.max(1, width))
          const runDuration = 8_800 + distanceFraction * 6_800
          const p = clamp01(elapsed / runDuration)
          const uneven = clamp01(p - Math.sin(p * Math.PI * 15 + seed * 1.31) * 0.0055 * (1 - p))
          const travel = 1 - Math.pow(1 - uneven, 1.14)
          x = reactionStartX + (exitX - reactionStartX) * travel
          const gait = reactionGait(elapsed, false)
          stepPhase = gait.stepPhase
          stepIndex = gait.stepIndex
          walking = true
          reactionFade = 1 - smoothStep((p - 0.91) / 0.09)
          if (p >= 1) {
            finish()
            return
          }
        } else if (reaction === 'fire-trapped') {
          const elapsed = time - reactionStartedAt
          reactionLabel = 'turning'
          walking = false
          stepPhase = 0.5
          stepIndex = reactionStartStepIndex
          x = reactionStartX + Math.sin(elapsed * 0.0047 + seed) * 0.55

          // Irregularly glance toward one exit and then the other. No frantic NPC
          // animation: the lantern simply betrays that the carrier is checking both.
          const lookSlot = Math.floor(elapsed / 930)
          const lookBias = seeded(seed + lookSlot * 9.73 + 71.2)
          renderDirection = lookBias > 0.5 ? 1 : -1

          // A truly boxed-in encounter must not live forever if both fires persist.
          // After a long stand-off, let the sighting dissolve rather than make the
          // invisible person charge through a fire just to satisfy the scheduler.
          reactionFade = 1 - smoothStep((elapsed - 24_000) / 4_000)
          if (elapsed >= 28_000) {
            finish()
            return
          }
        }

        lastX = x
        lastStepIndex = stepIndex
        lastRenderDirection = renderDirection
        const scale = startScale * Math.pow(endScale / startScale, progress)
        const fadeIn = smoothStep(progress / 0.045)
        const fadeOut = reaction === 'none' ? 1 - smoothStep((progress - 0.955) / 0.045) : 1
        const alpha = fadeIn * fadeOut * reactionFade * lanternWeatherVisibility(phaseRef.current)

        publishAmbientLantern(
          initial.id,
          progress,
          renderDirection,
          alpha,
          x,
          scale,
          stepPhase,
          stepIndex,
          walking,
          reactionLabel,
        )
      }

      if (progress >= 1 && reaction === 'none') {
        finish()
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      clearAmbientLantern()
    }
  }, [event.id, onComplete])

  return null
}

function useTrainAudio(event: AmbientLifeEvent, soundOn: boolean) {
  const audioReadyNonce = usePitchAudioReadyNonce()
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
        if (disposed || audioCtx.state !== 'running') return

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
            if (disposed || audioCtx.state !== 'running') return

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
  }, [audioReadyNonce, duration, horn, hornDelay, id, kind, soundOn])
}

export function AmbientLifeLayer({ event, soundOn, phase, onComplete, testReaction }: AmbientLifeLayerProps) {
  useTrainAudio(event, soundOn)

  useEffect(() => {
    // Lantern owns its own completion because an owl panic or lightning retreat can
    // legitimately run past the originally scheduled crossing duration.
    if (event.kind === 'lantern') return
    const duration = event.duration ?? (event.kind === 'train' ? 92_000 : 190_000)
    const timer = window.setTimeout(() => onComplete?.(event.kind, event.id), duration + 250)
    return () => window.clearTimeout(timer)
  }, [event, onComplete])

  if (event.kind === 'train') return <Train event={event} phase={phase} />
  if (event.kind === 'lantern') return <Lantern event={event} phase={phase} onComplete={onComplete} testReaction={testReaction} />
  return <Airplane event={event} />
}
