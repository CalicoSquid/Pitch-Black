type PitchAudioContext = AudioContext

let pitchAudioContext: PitchAudioContext | null = null
let pitchAudioMasterGain: GainNode | null = null
let pitchAudioMuted = false

function ensurePitchAudioMaster(audioCtx: AudioContext) {
  if (!pitchAudioMasterGain) {
    pitchAudioMasterGain = audioCtx.createGain()
    pitchAudioMasterGain.gain.value = pitchAudioMuted ? 0 : 1
    pitchAudioMasterGain.connect(audioCtx.destination)
  }
  return pitchAudioMasterGain
}

export function unlockPitchAudio() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null

    if (!pitchAudioContext || pitchAudioContext.state === 'closed') {
      pitchAudioContext = new AudioCtx()
      pitchAudioMasterGain = null
    }

    ensurePitchAudioMaster(pitchAudioContext)

    if (pitchAudioContext.state === 'suspended') {
      void pitchAudioContext.resume()
    }
    return pitchAudioContext
  } catch {
    return null
  }
}

export function getPitchAudio() {
  return pitchAudioContext ?? unlockPitchAudio()
}

export function getPitchAudioOutput(audioCtx: AudioContext) {
  return ensurePitchAudioMaster(audioCtx)
}

export function setPitchAudioMuted(muted: boolean) {
  pitchAudioMuted = muted
  const audioCtx = pitchAudioContext
  const master = pitchAudioMasterGain
  if (!audioCtx || !master) return

  const target = muted ? 0 : 1
  master.gain.cancelScheduledValues(audioCtx.currentTime)
  master.gain.setTargetAtTime(target, audioCtx.currentTime, 0.055)
}
