type PitchAudioContext = AudioContext

let pitchAudioContext: PitchAudioContext | null = null
let pitchAudioOutputGain: GainNode | null = null
let pitchAudioFadeGain: GainNode | null = null
let pitchAudioMuteGain: GainNode | null = null
let pitchAudioTransientGain: GainNode | null = null
let pitchAudioMuted = false
let pitchAudioVolume = 1

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
      pitchAudioOutputGain = null
      pitchAudioFadeGain = null
      pitchAudioMuteGain = null
      pitchAudioTransientGain = null
    }

    ensurePitchAudioMaster(pitchAudioContext)

    if (pitchAudioContext.state === 'suspended') {
      // A returning session may have Sound persisted ON before the browser has
      // received a fresh user gesture. That autoplay-policy rejection is normal;
      // the global gesture unlock in App retries immediately on the first input.
      void pitchAudioContext.resume().catch(() => {})
    }
    return pitchAudioContext
  } catch {
    return null
  }
}

export function suspendPitchAudio() {
  const audioCtx = pitchAudioContext
  cancelPitchAudioTransients()
  if (!audioCtx || audioCtx.state !== 'running') return

  try {
    void audioCtx.suspend()
  } catch {
    // Browser audio lifecycle support varies; suspension failure is harmless.
  }
}

export function getPitchAudio() {
  return unlockPitchAudio()
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
  if (!audioCtx || !outputGain) return

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
