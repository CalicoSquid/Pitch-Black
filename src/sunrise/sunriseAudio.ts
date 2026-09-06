export type SunriseAudioStatus = 'idle' | 'ready' | 'unavailable' | 'lost'

export const MORNING_AMBIENCE_URL = '/audio/summer-dawn-birds-phoenix-arizona.mp3'
export const MORNING_AMBIENCE_START_FRACTION = 0.55

type AudioContextConstructor = typeof AudioContext

type ActiveTone = {
  oscillator: OscillatorNode
  gain: GainNode
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep01(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

/**
 * Natural morning ambience waits until the latter part of dawn, then grows with
 * the light instead of appearing as a second alarm at wake time.
 */
export function morningAmbienceArrival(progress: number) {
  return smoothstep01((clamp01(progress) - MORNING_AMBIENCE_START_FRACTION) / (1 - MORNING_AMBIENCE_START_FRACTION))
}

/**
 * Wake-up audio deliberately lives outside TQW's nighttime master graph. Muting
 * rain/crickets therefore cannot silence an alarm that the user explicitly armed.
 * The recorded morning bed is fetched in compressed form when an audible sunrise
 * is armed, but is not decoded into PCM until late dawn so it does not sit in
 * memory all night.
 */
export class SunriseAudioController {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private morningBus: GainNode | null = null
  private loopTimer: number | null = null
  private morningStopTimer: number | null = null
  private morningStopSource: AudioBufferSourceNode | null = null
  private morningPlaybackGeneration = 0
  private activeTones = new Set<ActiveTone>()
  private morningSource: AudioBufferSourceNode | null = null
  private morningCompressed: ArrayBuffer | null = null
  private morningBuffer: AudioBuffer | null = null
  private morningFetch: Promise<ArrayBuffer | null> | null = null
  private morningDecode: Promise<AudioBuffer | null> | null = null
  private morningAbort: AbortController | null = null
  private generation = 0
  private wakeLevel = 0.35
  private status: SunriseAudioStatus = 'idle'
  private statusListener: ((status: SunriseAudioStatus) => void) | null = null

  setStatusListener(listener: ((status: SunriseAudioStatus) => void) | null) {
    this.statusListener = listener
    if (listener) listener(this.status)
  }

  private setStatus(status: SunriseAudioStatus) {
    if (this.status === status) return
    this.status = status
    this.statusListener?.(status)
  }

  getStatus() {
    return this.status
  }

  private getAudioContextConstructor(): AudioContextConstructor | null {
    if (typeof window === 'undefined') return null
    return window.AudioContext || (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext || null
  }

  private ensureGraph() {
    const AudioCtx = this.getAudioContextConstructor()
    if (!AudioCtx) {
      this.setStatus('unavailable')
      return null
    }

    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioCtx()
      this.master = this.context.createGain()
      this.morningBus = this.context.createGain()
      this.master.gain.value = 0
      this.morningBus.gain.value = 0
      this.master.connect(this.context.destination)
      this.morningBus.connect(this.context.destination)
      const context = this.context
      if (typeof context.addEventListener === 'function') {
        context.addEventListener('statechange', () => {
          if (this.context !== context || context.state === 'closed') return
          this.setStatus(context.state === 'running' ? 'ready' : 'lost')
        })
      }
    }
    return this.context
  }

  async prepare() {
    const generation = this.generation
    const context = this.ensureGraph()
    if (!context) return false

    try {
      if (context.state !== 'running') await context.resume()
    } catch {
      if (generation === this.generation) this.setStatus('unavailable')
      return false
    }

    if (generation !== this.generation || this.context !== context || context.state !== 'running') return false
    this.setStatus('ready')
    return true
  }

  /**
   * Prime only the ~1.2 MB compressed field recording. The much larger decoded
   * AudioBuffer is intentionally deferred until late dawn.
   */
  async preloadMorningAsset() {
    if (this.morningBuffer || this.morningCompressed) return true
    if (this.morningFetch) return (await this.morningFetch) !== null
    if (typeof fetch !== 'function') return false

    const generation = this.generation
    const abort = typeof AbortController !== 'undefined' ? new AbortController() : null
    this.morningAbort = abort

    let request: Promise<ArrayBuffer | null>
    request = fetch(MORNING_AMBIENCE_URL, {
      cache: 'force-cache',
      ...(abort ? { signal: abort.signal } : {}),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`morning ambience fetch failed: ${response.status}`)
        return response.arrayBuffer()
      })
      .then((compressed) => {
        if (generation !== this.generation || (abort && this.morningAbort !== abort)) return null
        this.morningCompressed = compressed
        return compressed
      })
      .catch(() => null)
      .finally(() => {
        if (this.morningFetch === request) this.morningFetch = null
        if (!abort || this.morningAbort === abort) this.morningAbort = null
      })

    this.morningFetch = request
    return (await request) !== null
  }

  private async ensureMorningBuffer() {
    if (this.morningBuffer) return this.morningBuffer
    if (this.morningDecode) return this.morningDecode

    const generation = this.generation
    const context = this.context
    if (!context || context.state === 'closed') return null

    if (!this.morningCompressed) {
      const loaded = await this.preloadMorningAsset()
      if (!loaded || generation !== this.generation || this.context !== context) return null
    }

    const compressed = this.morningCompressed
    if (!compressed) return null

    let decoding: Promise<AudioBuffer | null>
    decoding = context.decodeAudioData(compressed.slice(0))
      .then((buffer) => {
        if (generation !== this.generation || this.context !== context || context.state === 'closed') return null
        this.morningBuffer = buffer
        // Keep the small compressed payload alongside active PCM. This lets a
        // Sound Check -> Arm transition discard decoded audio without refetching.
        return buffer
      })
      .catch(() => null)
      .finally(() => {
        if (this.morningDecode === decoding) this.morningDecode = null
      })

    this.morningDecode = decoding
    return decoding
  }

  setWakeLevel(level: number) {
    this.wakeLevel = clamp01(level)
    const context = this.context
    const master = this.master
    if (!context || !master || context.state === 'closed') return
    const now = context.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setTargetAtTime(this.levelToGain(this.wakeLevel), now, 0.65)
  }

  private levelToGain(level: number) {
    // A bounded internal ceiling. Device/system volume remains outside browser control.
    return 0.12 * Math.pow(clamp01(level), 1.25)
  }

  private levelToMorningGain(level: number) {
    // The field recording is intentionally quiet and naturally dynamic. This separate
    // ceiling keeps it audible without forcing the chime and birds through one gain law.
    return 0.82 * Math.pow(clamp01(level), 0.9)
  }

  private makeChime(startAt: number, levelScale = 1) {
    const context = this.context
    const master = this.master
    if (!context || !master || context.state !== 'running') return
    const generation = this.generation
    const frequencies = [261.63, 392, 523.25]

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const tone: ActiveTone = { oscillator, gain }
      this.activeTones.add(tone)

      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      oscillator.detune.value = index === 1 ? -2 : index === 2 ? 2 : 0
      oscillator.connect(gain).connect(master)

      const begin = startAt + index * 0.11
      const peak = 0.34 * levelScale * (index === 0 ? 1 : index === 1 ? 0.72 : 0.52)
      gain.gain.setValueAtTime(0.0001, begin)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), begin + 0.7)
      gain.gain.exponentialRampToValueAtTime(0.0001, begin + 3.8)
      oscillator.start(begin)
      oscillator.stop(begin + 4)
      oscillator.onended = () => {
        this.activeTones.delete(tone)
        try { oscillator.disconnect() } catch { /* already disconnected */ }
        try { gain.disconnect() } catch { /* already disconnected */ }
        if (generation !== this.generation) return
      }
    })
  }

  private stopMorningSource(source: AudioBufferSourceNode | null = this.morningSource) {
    if (!source) return
    if (this.morningSource === source) this.morningSource = null
    try { source.stop() } catch { /* already stopped */ }
    try { source.disconnect() } catch { /* already disconnected */ }
  }

  private clearMorningStopTimer() {
    if (this.morningStopTimer !== null) window.clearTimeout(this.morningStopTimer)
    this.morningStopTimer = null
    this.morningStopSource = null
  }

  private scheduleMorningSourceStop(source: AudioBufferSourceNode, durationSeconds: number) {
    // Repeated below-threshold updates must not keep pushing the stop farther out.
    if (this.morningStopTimer !== null && this.morningStopSource === source) return
    this.clearMorningStopTimer()
    this.morningStopSource = source
    this.morningStopTimer = window.setTimeout(() => {
      this.morningStopTimer = null
      this.morningStopSource = null
      this.stopMorningSource(source)
    }, Math.max(80, durationSeconds * 1000 + 120))
  }

  /**
   * Explicitly silence the natural morning bed. This is intentionally separate
   * from the chime master so zero wake volume / early snooze progress cannot
   * leave an already-running bird loop alive at a stale low gain.
   */
  silenceMorningAmbience(durationSeconds = 1.2) {
    this.morningPlaybackGeneration += 1
    const context = this.context
    const morningBus = this.morningBus
    const source = this.morningSource
    if (!context || context.state === 'closed') {
      if (source) this.stopMorningSource(source)
      return
    }

    const now = context.currentTime
    if (morningBus) {
      morningBus.gain.cancelScheduledValues(now)
      morningBus.gain.setValueAtTime(Math.max(0.0001, morningBus.gain.value), now)
      morningBus.gain.setTargetAtTime(0.0001, now, Math.max(0.05, durationSeconds / 4))
    }
    if (source) this.scheduleMorningSourceStop(source, durationSeconds)
  }

  private cancelPendingMorningLoad() {
    try { this.morningAbort?.abort() } catch { /* unsupported/finished request */ }
    this.morningAbort = null
    this.morningFetch = null
    // decodeAudioData cannot be aborted, but generation checks prevent a late result
    // from becoming audible or staying referenced after the owner has moved on.
    this.morningDecode = null
  }

  /**
   * Start/update the natural field recording according to dawn progress. Calling
   * this repeatedly is cheap once the source is running; only the gain target moves.
   */
  async updateMorningAmbience(
    progress: number,
    level = this.wakeLevel,
    shouldStart: () => boolean = () => true,
    rampSeconds = 5,
  ) {
    this.wakeLevel = clamp01(level)
    const arrival = morningAmbienceArrival(progress)
    if (this.wakeLevel <= 0.001 || arrival <= 0.0005) {
      // Zero volume and below-arrival progress are commands to silence an
      // existing source, not merely reasons to skip creating a new one.
      this.silenceMorningAmbience(this.wakeLevel <= 0.001 ? 0.3 : Math.min(1.2, rampSeconds))
      return false
    }

    const generation = this.generation
    const morningPlaybackGeneration = this.morningPlaybackGeneration
    // If Snooze had scheduled a stop but the final ramp has genuinely reached
    // the arrival region again, keep/restart the bed instead of killing it late.
    this.clearMorningStopTimer()
    const ready = await this.prepare()
    if (!ready || generation !== this.generation || morningPlaybackGeneration !== this.morningPlaybackGeneration || !shouldStart()) return false

    const buffer = await this.ensureMorningBuffer()
    if (!buffer || generation !== this.generation || morningPlaybackGeneration !== this.morningPlaybackGeneration || !shouldStart()) return false

    const context = this.context
    const morningBus = this.morningBus
    if (!context || !morningBus || context.state !== 'running' || generation !== this.generation || morningPlaybackGeneration !== this.morningPlaybackGeneration || !shouldStart()) return false

    if (!this.morningSource) {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.loopStart = 0
      source.loopEnd = buffer.duration
      source.connect(morningBus)
      this.morningSource = source
      const maxOffset = Math.max(0, buffer.duration - 8)
      const offset = maxOffset > 0 ? Math.random() * maxOffset : 0
      source.start(context.currentTime, offset)
      source.onended = () => {
        if (this.morningSource === source) this.morningSource = null
        try { source.disconnect() } catch { /* already disconnected */ }
      }
    }

    const now = context.currentTime
    const target = this.levelToMorningGain(this.wakeLevel) * arrival
    morningBus.gain.cancelScheduledValues(now)
    morningBus.gain.setValueAtTime(Math.max(0.0001, morningBus.gain.value), now)
    morningBus.gain.setTargetAtTime(target, now, Math.max(0.08, rampSeconds / 3))
    return true
  }

  /**
   * Transition from transient Sound Check playback into an armed alarm without
   * carrying decoded PCM through the night. The compressed recording is kept so
   * late dawn can decode locally without another network request.
   */
  resetForArmedWaiting() {
    this.generation += 1
    this.morningPlaybackGeneration += 1
    this.clearLoopTimer()
    this.clearMorningStopTimer()
    this.cancelPendingMorningLoad()

    const source = this.morningSource
    if (source) this.stopMorningSource(source)

    for (const tone of Array.from(this.activeTones)) {
      try { tone.oscillator.stop() } catch { /* already stopped */ }
      try { tone.oscillator.disconnect() } catch { /* harmless */ }
      try { tone.gain.disconnect() } catch { /* harmless */ }
      this.activeTones.delete(tone)
    }

    this.morningBuffer = null

    const context = this.context
    if (!context || context.state === 'closed') return
    const now = context.currentTime
    if (this.master) {
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(0.0001, now)
    }
    if (this.morningBus) {
      this.morningBus.gain.cancelScheduledValues(now)
      this.morningBus.gain.setValueAtTime(0.0001, now)
    }
  }

  /** A short combined check: natural dawn bed plus one restrained chime. */
  async soundCheck(level = this.wakeLevel) {
    this.wakeLevel = clamp01(level)
    const generation = this.generation
    const ready = await this.prepare()
    if (!ready || generation !== this.generation) return false

    await this.updateMorningAmbience(1, this.wakeLevel, () => generation === this.generation, 0.35)
    if (generation !== this.generation) return false

    const context = this.context!
    const master = this.master!
    const morningBus = this.morningBus!
    const now = context.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(0.0001, now)
    master.gain.linearRampToValueAtTime(this.levelToGain(this.wakeLevel), now + 0.35)
    this.makeChime(now + 0.04, 0.78)
    master.gain.setTargetAtTime(0.0001, now + 2.2, 0.5)
    morningBus.gain.setTargetAtTime(0.0001, now + 3.4, 0.45)
    return true
  }

  /** One chime for the accelerated preview without disturbing its bird fade. */
  async previewChime(level = this.wakeLevel) {
    this.wakeLevel = clamp01(level)
    const generation = this.generation
    const ready = await this.prepare()
    if (!ready || generation !== this.generation) return false
    const context = this.context!
    const master = this.master!
    const now = context.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
    master.gain.setTargetAtTime(this.levelToGain(this.wakeLevel), now, 0.25)
    this.makeChime(now + 0.04, 0.78)
    master.gain.setTargetAtTime(0.0001, now + 2.2, 0.5)
    return true
  }

  async startWake(level = this.wakeLevel, shouldStart: () => boolean = () => true) {
    this.wakeLevel = clamp01(level)
    const generation = this.generation
    const ready = await this.prepare()
    // The hook supplies a live lifecycle predicate. Generation catches controller-
    // local cancellation; shouldStart catches a Snooze/Finish/Cancel that happened
    // while AudioContext.resume() was still pending.
    if (!ready || generation !== this.generation || !shouldStart()) return false
    const context = this.context!
    const master = this.master!
    if (this.context !== context || context.state !== 'running' || generation !== this.generation || !shouldStart()) return false
    const now = context.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
    master.gain.setTargetAtTime(this.levelToGain(this.wakeLevel), now, 1.1)

    this.clearLoopTimer()
    if (this.wakeLevel > 0.001 && shouldStart()) {
      this.makeChime(now + 0.08)
      this.loopTimer = window.setInterval(() => {
        if (generation !== this.generation || !this.context || this.context.state !== 'running' || !shouldStart()) {
          this.clearLoopTimer()
          return
        }
        this.makeChime(this.context.currentTime + 0.05, 0.9)
      }, 14_000)
    }
    return true
  }

  soften(durationSeconds = 2.5) {
    // Invalidate any startWake()/soundCheck()/bird decode that is still awaiting
    // readiness. Existing sources are left to their buses' fade, then stopped.
    this.generation += 1
    this.morningPlaybackGeneration += 1
    this.clearLoopTimer()
    this.cancelPendingMorningLoad()
    const context = this.context
    const master = this.master
    const morningBus = this.morningBus
    if (!context || context.state === 'closed') return
    const now = context.currentTime
    if (master) {
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
      master.gain.setTargetAtTime(0.0001, now, Math.max(0.08, durationSeconds / 4))
    }
    if (morningBus) {
      morningBus.gain.cancelScheduledValues(now)
      morningBus.gain.setValueAtTime(Math.max(0.0001, morningBus.gain.value), now)
      morningBus.gain.setTargetAtTime(0.0001, now, Math.max(0.08, durationSeconds / 4))
    }

    const source = this.morningSource
    if (source) this.scheduleMorningSourceStop(source, durationSeconds)
  }

  private clearLoopTimer() {
    if (this.loopTimer === null) return
    window.clearInterval(this.loopTimer)
    this.loopTimer = null
  }

  async release(fadeSeconds = 0.6) {
    this.generation += 1
    this.morningPlaybackGeneration += 1
    this.clearLoopTimer()
    this.clearMorningStopTimer()
    this.cancelPendingMorningLoad()
    const context = this.context
    const master = this.master
    const morningBus = this.morningBus
    const morningSource = this.morningSource
    this.context = null
    this.master = null
    this.morningBus = null
    this.morningSource = null
    this.morningCompressed = null
    this.morningBuffer = null

    if (!context || context.state === 'closed') {
      this.activeTones.clear()
      this.setStatus('idle')
      return
    }

    try {
      const now = context.currentTime
      if (master) {
        master.gain.cancelScheduledValues(now)
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
        master.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.05, fadeSeconds))
      }
      if (morningBus) {
        morningBus.gain.cancelScheduledValues(now)
        morningBus.gain.setValueAtTime(Math.max(0.0001, morningBus.gain.value), now)
        morningBus.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.05, fadeSeconds))
      }
      if (morningSource) {
        try { morningSource.stop(now + Math.max(0.05, fadeSeconds)) } catch { /* already stopped */ }
      }
      // Stop every oscillator owned by the alarm. The generation change above
      // also invalidates any prepare/check promise that completes late.
      for (const tone of this.activeTones) {
        try { tone.oscillator.stop(now + Math.max(0.05, fadeSeconds)) } catch { /* already stopped */ }
      }
      this.activeTones.clear()
      await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(900, Math.max(60, fadeSeconds * 1000 + 30))))
      try { await context.close() } catch { /* browser may already have closed it */ }
    } finally {
      this.setStatus('idle')
    }
  }

  disposeNow() {
    this.generation += 1
    this.morningPlaybackGeneration += 1
    this.clearLoopTimer()
    this.clearMorningStopTimer()
    this.cancelPendingMorningLoad()
    const context = this.context
    const morningSource = this.morningSource
    this.context = null
    this.master = null
    this.morningBus = null
    this.morningSource = null
    this.morningCompressed = null
    this.morningBuffer = null
    if (context) {
      if (morningSource) this.stopMorningSource(morningSource)
      for (const tone of this.activeTones) {
        try { tone.oscillator.stop() } catch { /* already stopped */ }
        try { tone.oscillator.disconnect() } catch { /* harmless */ }
        try { tone.gain.disconnect() } catch { /* harmless */ }
      }
      this.activeTones.clear()
      try { void context.close() } catch { /* harmless */ }
    }
    this.setStatus('idle')
  }
}
