type PitchAudioContext = AudioContext

let pitchAudioContext: PitchAudioContext | null = null
let pitchAudioOutputGain: GainNode | null = null
let pitchAudioFadeGain: GainNode | null = null
let pitchAudioMuteGain: GainNode | null = null
let pitchAudioTransientGain: GainNode | null = null
let pitchAudioMuted = false
let pitchAudioVolume = 1
let pitchAudioNeedsReadySignal = true
let readyTimer = 0
let audioGeneration = 0
let transientGeneration = 0

export const PITCH_AUDIO_READY_EVENT = 'tqw:pitch-audio-ready'

function signalPitchAudioReady(audioCtx: AudioContext) {
  if (!pitchAudioNeedsReadySignal || audioCtx.state !== 'running') return
  pitchAudioNeedsReadySignal = false
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PITCH_AUDIO_READY_EVENT))

  // Let React rebuild the persistent loop sources before reopening the master bus.
  // This prevents a stale pre-background rain/storm gain from leaking for a frame
  // when the AudioContext resumes.
  const outputGain = pitchAudioOutputGain
  const generation = audioGeneration
  window.clearTimeout(readyTimer)
  if (outputGain) {
    readyTimer = window.setTimeout(() => {
      readyTimer = 0
      if (generation !== audioGeneration || pitchAudioNeedsReadySignal || document.visibilityState !== 'visible') return
      if (pitchAudioContext !== audioCtx || audioCtx.state !== 'running') return
      outputGain.gain.cancelScheduledValues(audioCtx.currentTime)
      outputGain.gain.setTargetAtTime(pitchAudioVolume, audioCtx.currentTime, 0.045)
    }, 90)
  }
}

function ensurePitchAudioMaster(audioCtx: AudioContext) {
  if (!pitchAudioOutputGain || !pitchAudioFadeGain || !pitchAudioMuteGain) {
    pitchAudioOutputGain = audioCtx.createGain()
    pitchAudioFadeGain = audioCtx.createGain()
    pitchAudioMuteGain = audioCtx.createGain()

    pitchAudioOutputGain.gain.value = pitchAudioVolume
    pitchAudioFadeGain.gain.value = 1
    pitchAudioMuteGain.gain.value = pitchAudioMuted ? 0 : 1

    pitchAudioOutputGain.connect(pitchAudioFadeGain)
    pitchAudioFadeGain.connect(pitchAudioMuteGain)
    pitchAudioMuteGain.connect(audioCtx.destination)
  }
  return pitchAudioOutputGain
}

function ensurePitchAudioTransientOutput(audioCtx: AudioContext) {
  const output = ensurePitchAudioMaster(audioCtx)
  if (!pitchAudioTransientGain) {
    pitchAudioTransientGain = audioCtx.createGain()
    pitchAudioTransientGain.gain.value = 1
    pitchAudioTransientGain.connect(output)
  }
  return pitchAudioTransientGain
}

export function cancelPitchAudioTransients() {
  transientGeneration += 1
  const audioCtx = pitchAudioContext
  const transientGain = pitchAudioTransientGain
  if (!audioCtx || !transientGain) return

  // Disconnecting the old transient bus permanently silences already-started
  // and already-scheduled one-shots. A fresh bus is created lazily for future
  // events, so a thunder tail or owl call cannot reappear after mute/background.
  try {
    transientGain.gain.cancelScheduledValues(audioCtx.currentTime)
    transientGain.gain.setValueAtTime(0, audioCtx.currentTime)
    transientGain.disconnect()
  } catch {
    // A partially torn-down Web Audio graph is harmless here.
  }
  pitchAudioTransientGain = null
}

export function getPitchAudioTransientGeneration() {
  return transientGeneration
}

function observePitchAudioState(audioCtx: AudioContext) {
  const onStateChange = () => {
    if (pitchAudioContext !== audioCtx) return
    if (audioCtx.state === 'running') {
      signalPitchAudioReady(audioCtx)
      return
    }

    // Browsers can suspend/interrupt Web Audio outside our own visibility handler.
    // Treat every non-running state as a fresh readiness boundary so persistent
    // ambience is rebuilt exactly once when the context genuinely runs again.
    pitchAudioNeedsReadySignal = true
    window.clearTimeout(readyTimer)
    readyTimer = 0
    if (pitchAudioOutputGain && audioCtx.state !== 'closed') {
      try {
        pitchAudioOutputGain.gain.cancelScheduledValues(audioCtx.currentTime)
        pitchAudioOutputGain.gain.setValueAtTime(0, audioCtx.currentTime)
      } catch {
        // A context can disappear while the browser is tearing the page down.
      }
    }
  }

  if (typeof audioCtx.addEventListener === 'function') audioCtx.addEventListener('statechange', onStateChange)
}

export function unlockPitchAudio() {
  try {
    // Never create or resume Web Audio while the page is backgrounded. Some
    // mobile browsers otherwise keep ambient audio alive after the browser closes.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return null
    }
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null

    if (!pitchAudioContext || pitchAudioContext.state === 'closed') {
      pitchAudioContext = new AudioCtx()
      observePitchAudioState(pitchAudioContext)
      pitchAudioOutputGain = null
      pitchAudioFadeGain = null
      pitchAudioMuteGain = null
      pitchAudioTransientGain = null
      pitchAudioNeedsReadySignal = true
    }

    const masterOutput = ensurePitchAudioMaster(pitchAudioContext)
    if (pitchAudioNeedsReadySignal && pitchAudioContext.state !== 'running') {
      masterOutput.gain.value = 0
    }

    if (pitchAudioContext.state === 'running') {
      signalPitchAudioReady(pitchAudioContext)
    } else if (pitchAudioContext.state === 'suspended' || (pitchAudioContext.state as string) === 'interrupted') {
      // A returning session may have Sound persisted ON before the browser has
      // received a fresh user gesture. That autoplay-policy rejection is normal;
      // the global gesture unlock in App retries immediately on the first input.
      const contextToResume = pitchAudioContext
      const generation = audioGeneration
      void contextToResume.resume()
        .then(() => {
          if (generation !== audioGeneration || document.visibilityState !== 'visible') {
            if (document.visibilityState !== 'visible') suspendPitchAudio()
            return
          }
          signalPitchAudioReady(contextToResume)
        })
        .catch(() => {})
    }
    return pitchAudioContext
  } catch {
    return null
  }
}

export function suspendPitchAudio() {
  audioGeneration += 1
  window.clearTimeout(readyTimer)
  readyTimer = 0
  const audioCtx = pitchAudioContext
  pitchAudioNeedsReadySignal = true
  cancelPitchAudioTransients()
  if (!audioCtx || audioCtx.state === 'closed') return

  try {
    if (pitchAudioOutputGain) {
      pitchAudioOutputGain.gain.cancelScheduledValues(audioCtx.currentTime)
      pitchAudioOutputGain.gain.setValueAtTime(0, audioCtx.currentTime)
    }
    void audioCtx.suspend().catch(() => {})
  } catch {
    // Browser audio lifecycle support varies; suspension failure is harmless.
  }
}

export function getPitchAudio() {
  const audioCtx = unlockPitchAudio()
  return audioCtx?.state === 'running' ? audioCtx : null
}

export function getPitchAudioOutput(audioCtx: AudioContext) {
  return ensurePitchAudioMaster(audioCtx)
}

export function getPitchAudioTransientOutput(audioCtx: AudioContext) {
  return ensurePitchAudioTransientOutput(audioCtx)
}

export function setPitchAudioMuted(muted: boolean) {
  pitchAudioMuted = muted
  if (muted) cancelPitchAudioTransients()
  const audioCtx = pitchAudioContext
  const muteGain = pitchAudioMuteGain
  if (!audioCtx || !muteGain) return

  const target = muted ? 0 : 1
  muteGain.gain.cancelScheduledValues(audioCtx.currentTime)
  muteGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.055)
}

export function setPitchAudioVolume(volume: number) {
  pitchAudioVolume = Math.min(1, Math.max(0, volume))
  const audioCtx = pitchAudioContext
  const outputGain = pitchAudioOutputGain
  if (!audioCtx || !outputGain || pitchAudioNeedsReadySignal) return

  outputGain.gain.cancelScheduledValues(audioCtx.currentTime)
  outputGain.gain.setTargetAtTime(pitchAudioVolume, audioCtx.currentTime, 0.045)
}

export function fadePitchAudioToSilence(durationSeconds: number) {
  const audioCtx = pitchAudioContext
  const fadeGain = pitchAudioFadeGain
  if (!audioCtx || !fadeGain) return

  const now = audioCtx.currentTime
  const duration = Math.max(0.05, durationSeconds)
  fadeGain.gain.cancelScheduledValues(now)
  fadeGain.gain.setValueAtTime(fadeGain.gain.value, now)
  fadeGain.gain.linearRampToValueAtTime(0, now + duration)
}

export function restorePitchAudioFade() {
  const audioCtx = pitchAudioContext
  const fadeGain = pitchAudioFadeGain
  if (!audioCtx || !fadeGain) return

  const now = audioCtx.currentTime
  fadeGain.gain.cancelScheduledValues(now)
  fadeGain.gain.setTargetAtTime(1, now, 0.08)
}

/** Replace a continuous control envelope without retaining overnight automation history. */
export function setContinuousAudioTarget(param: AudioParam, target: number, now: number, tau: number) {
  const current = param.value
  param.cancelScheduledValues(0)
  param.setValueAtTime(current, now)
  param.setTargetAtTime(target, now, tau)
}
