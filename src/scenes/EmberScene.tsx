import { canvasPixelRatio } from '../rendering/canvasBudget'
import { useEffect, useRef } from 'react'
import { setContinuousAudioTarget, getPitchAudio, getPitchAudioOutput, getPitchAudioTransientOutput } from '../audio/pitchAudio'
import { lightningGroundStrikeSignal } from '../world/lightningSignal'
import {
  ensureWorld,
  groundSurfaceYAtIndex,
  pitchWorld,
  saveWorld,
  snowSurfaceYAtIndex,
  standingWaterSurfaceY,
  worldResetSignal,
  worldIndexAt,
} from '../world/worldState'

export function EmberScene({
  speed,
  soundOn,
  active,
  rainActive,
  snowActive,
  visible,
  externalMeteorId = 0,
}: {
  speed: number
  soundOn: boolean
  active: boolean
  rainActive: boolean
  snowActive: boolean
  visible: boolean
  externalMeteorId?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const rainActiveRef = useRef(rainActive)
  const snowActiveRef = useRef(snowActive)
  const soundOnRef = useRef(soundOn)
  const speedRef = useRef(speed)
  const visibleRef = useRef(visible)
  const externalMeteorIdRef = useRef(externalMeteorId)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    rainActiveRef.current = rainActive
  }, [rainActive])

  useEffect(() => {
    snowActiveRef.current = snowActive
  }, [snowActive])

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  useEffect(() => {
    externalMeteorIdRef.current = externalMeteorId
  }, [externalMeteorId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = canvasPixelRatio(width, height, 1.5)
    let raf = 0
    let idleTimer = 0
    let last = performance.now()
    let meteorStartedAt = -1
    let wasActive = false
    let lastExternalMeteorId = externalMeteorIdRef.current
    let rainMix = rainActiveRef.current ? 1 : 0
    let snowMix = snowActiveRef.current ? 1 : 0

    let targetX = 0
    let targetY = 0
    let startX = 0
    let startY = 0
    let impacted = false
    let emberPurgeActive = false
    let hasIgnited = pitchWorld.ember.some((value) => value > 0.02) || pitchWorld.char.some((value) => value > 0.03)
    let impactAt = 0
    let impactIndex = 0

    let trail: Array<{ x: number; y: number; age: number }> = []
    let fragments: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number }> = []
    let sparks: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number }> = []
    let steam: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number; opacity: number }> = []
    let smoke: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number }> = []
    let lastLightningVersion = lightningGroundStrikeSignal.version
    let lastWorldResetVersion = worldResetSignal.version

    let fire = pitchWorld.ember
    let residue = pitchWorld.char
    let fireSnapshot = new Float32Array(fire.length)

    let audioCtx: AudioContext | null = null
    let whooshGain: GainNode | null = null
    let whooshFilter: BiquadFilterNode | null = null
    let whooshSource: AudioBufferSourceNode | null = null
    let fireGain: GainNode | null = null
    let fireFilter: BiquadFilterNode | null = null
    let fireSource: AudioBufferSourceNode | null = null
    let fireStopTimer = 0
    let lastFireLevelNode: GainNode | null = null
    let lastFireLevel = Number.NaN

    const ensureAudio = () => {
      audioCtx = getPitchAudio()
      return audioCtx
    }

    const disconnectWhoosh = (source = whooshSource, filter = whooshFilter, gain = whooshGain) => {
      try { source?.disconnect() } catch { /* harmless */ }
      try { filter?.disconnect() } catch { /* harmless */ }
      try { gain?.disconnect() } catch { /* harmless */ }
      if (whooshSource === source) {
        whooshSource = null
        whooshFilter = null
        whooshGain = null
      }
    }

    const disconnectFire = (source = fireSource, filter = fireFilter, gain = fireGain) => {
      try { source?.disconnect() } catch { /* harmless */ }
      try { filter?.disconnect() } catch { /* harmless */ }
      try { gain?.disconnect() } catch { /* harmless */ }
      if (fireSource === source) {
        fireSource = null
        fireFilter = null
        fireGain = null
        lastFireLevelNode = null
        lastFireLevel = Number.NaN
      }
    }

    const stopFireSound = (fadeSeconds = 0.24) => {
      const source = fireSource
      const filter = fireFilter
      const gain = fireGain
      if (!source || fireStopTimer) return
      if (gain && audioCtx && audioCtx.state !== 'closed') {
        gain.gain.cancelScheduledValues(audioCtx.currentTime)
        gain.gain.setTargetAtTime(0, audioCtx.currentTime, Math.max(0.03, fadeSeconds))
      }
      fireStopTimer = window.setTimeout(() => {
        fireStopTimer = 0
        if (fireSource !== source || (hasIgnited && soundOnRef.current)) return
        try { source.stop() } catch { /* already stopped */ }
        disconnectFire(source, filter, gain)
      }, Math.max(260, fadeSeconds * 2800))
    }

    const startWhoosh = () => {
      if (!soundOnRef.current) return
      if (whooshSource) return
      const ac = ensureAudio()
      if (!ac) return

      const seconds = 2.8
      const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate)
      const data = buffer.getChannelData(0)
      let low = 0
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = low * 0.93 + white * 0.07
        data[i] = low * 0.42 + white * 0.05
      }

      const source = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const gain = ac.createGain()
      source.buffer = buffer
      filter.type = 'bandpass'
      filter.frequency.value = 580
      filter.Q.value = 0.55
      gain.gain.value = 0

      source.connect(filter).connect(gain).connect(getPitchAudioTransientOutput(ac))
      source.start()
      gain.gain.setTargetAtTime(0.045, ac.currentTime, 0.38)
      filter.frequency.exponentialRampToValueAtTime(1250, ac.currentTime + 1.8)

      whooshSource = source
      whooshFilter = filter
      whooshGain = gain
      source.onended = () => disconnectWhoosh(source, filter, gain)
    }

    const impactSound = () => {
      if (!soundOnRef.current) return
      const ac = ensureAudio()
      if (!ac) return

      if (whooshGain) whooshGain.gain.setTargetAtTime(0, ac.currentTime, 0.055)

      const osc = ac.createOscillator()
      const impactGain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(82, ac.currentTime)
      osc.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.28)
      impactGain.gain.setValueAtTime(0.0001, ac.currentTime)
      impactGain.gain.exponentialRampToValueAtTime(0.17, ac.currentTime + 0.012)
      impactGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.42)
      osc.connect(impactGain).connect(getPitchAudioTransientOutput(ac))
      osc.onended = () => {
        try { osc.disconnect() } catch { /* harmless */ }
        try { impactGain.disconnect() } catch { /* harmless */ }
      }
      osc.start()
      osc.stop(ac.currentTime + 0.46)

      const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.32), ac.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        const envelope = Math.exp(-i / (ac.sampleRate * 0.052))
        data[i] = (Math.random() * 2 - 1) * envelope
      }
      const source = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const gain = ac.createGain()
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 850
      gain.gain.value = 0.055
      source.connect(filter).connect(gain).connect(getPitchAudioTransientOutput(ac))
      source.onended = () => {
        try { source.disconnect() } catch { /* harmless */ }
        try { filter.disconnect() } catch { /* harmless */ }
        try { gain.disconnect() } catch { /* harmless */ }
      }
      source.start()
    }

    const syncFireSound = () => {
      if (!soundOnRef.current || !hasIgnited) {
        stopFireSound()
        return
      }

      if (fireStopTimer) {
        window.clearTimeout(fireStopTimer)
        fireStopTimer = 0
      }
      const ac = ensureAudio()
      if (!ac) return
      if (fireSource) return

      const seconds = 4
      const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate)
      const data = buffer.getChannelData(0)
      let low = 0
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = low * 0.955 + white * 0.045
        const pop = Math.random() > 0.9989 ? (Math.random() * 2 - 1) * 0.7 : 0
        data[i] = low * 0.28 + white * 0.018 + pop
      }

      const source = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const gain = ac.createGain()
      source.buffer = buffer
      source.loop = true
      filter.type = 'lowpass'
      filter.frequency.value = 1800
      gain.gain.value = 0
      source.connect(filter).connect(gain).connect(getPitchAudioOutput(ac))
      source.start()
      fireSource = source
      fireFilter = filter
      fireGain = gain
      source.onended = () => disconnectFire(source, filter, gain)
    }

    const seeded = (i: number) => {
      const n = Math.sin(i * 12.9898 + 78.233) * 43758.5453
      return n - Math.floor(n)
    }

    const ensureFields = () => {
      fire = pitchWorld.ember
      residue = pitchWorld.char
      if (fireSnapshot.length !== fire.length) fireSnapshot = new Float32Array(fire.length)
    }

    const emberSurfaceYAtIndex = (index: number) => {
      const i = Math.max(0, Math.min(pitchWorld.drifts.length - 1, index))
      return groundSurfaceYAtIndex(i, height) - pitchWorld.drifts[i]
    }

    const emberSurfaceYAtX = (x: number) => emberSurfaceYAtIndex(worldIndexAt(x, width))

    const fireSurfaceYAtIndex = (index: number) => emberPurgeActive
      ? emberSurfaceYAtIndex(index)
      : snowSurfaceYAtIndex(index, height)

    const steamSurfaceYAtIndex = (index: number) => {
      const drySurface = emberSurfaceYAtIndex(index)
      const waterSurface = standingWaterSurfaceY(height)
      return Number.isFinite(waterSurface) ? Math.min(drySurface, waterSurface) : drySurface
    }

    const chooseTrajectory = () => {
      targetX = width * (0.28 + Math.random() * 0.44)
      targetY = emberSurfaceYAtX(targetX)

      const fromLeft = Math.random() > 0.5
      const horizontalDistance = width * (0.28 + Math.random() * 0.18)
      startX = targetX + (fromLeft ? -horizontalDistance : horizontalDistance)
      startX = Math.max(width * 0.08, Math.min(width * 0.92, startX))
      startY = 10 + Math.random() * Math.min(22, height * 0.025)
    }

    const spawnSteam = (index: number, amount: number) => {
      if (amount <= 0.010) return
      const x = Math.min(width, index * 6) + (Math.random() - 0.5) * 8
      const y = steamSurfaceYAtIndex(index) - 2
      const count = Math.min(4, Math.max(1, Math.round(amount * 12)))
      for (let i = 0; i < count; i++) {
        steam.push({
          x: x + (Math.random() - 0.5) * 4,
          y: y - Math.random() * 2,
          vx: (Math.random() - 0.5) * 0.10,
          vy: -(0.12 + Math.random() * 0.18),
          life: 0.85 + Math.random() * 0.70,
          size: 2.2 + Math.random() * 3.8,
          opacity: 0.032,
        })
      }
      if (steam.length > 220) {
        const excess = steam.length - 220
        steam.copyWithin(0, excess)
        steam.length = 220
      }
    }


    const spawnLightningSteam = (index: number, strength: number) => {
      const x = Math.min(width, index * 6)
      const y = steamSurfaceYAtIndex(index) - 2
      const count = 5 + Math.floor(strength * 4)
      for (let i = 0; i < count; i++) {
        const spread = 7 + strength * 8
        steam.push({
          x: x + (Math.random() - 0.5) * spread,
          y: y - Math.random() * 3,
          vx: (Math.random() - 0.5) * (0.16 + strength * 0.08),
          vy: -(0.18 + Math.random() * 0.24 + strength * 0.06),
          life: 0.95 + Math.random() * 0.75,
          size: 3.0 + Math.random() * 4.8 + strength * 1.2,
          opacity: 0.060 + Math.random() * 0.025,
        })
      }
      if (steam.length > 220) {
        const excess = steam.length - 220
        steam.copyWithin(0, excess)
        steam.length = 220
      }
    }

    const consumeWorldReset = (time: number) => {
      if (worldResetSignal.version === lastWorldResetVersion) return
      lastWorldResetVersion = worldResetSignal.version
      hasIgnited = false
      meteorStartedAt = -1
      impacted = false
      emberPurgeActive = false
      impactAt = 0
      impactIndex = 0
      trail.length = 0
      fragments.length = 0
      sparks.length = 0
      steam.length = 0
      smoke.length = 0
      fireSnapshot.fill(0)

      if (whooshSource) {
        const source = whooshSource
        const filter = whooshFilter
        const gain = whooshGain
        try { source.stop() } catch { /* already stopped */ }
        disconnectWhoosh(source, filter, gain)
      }
      stopFireSound(0.12)
      if (activeRef.current) beginMeteor(time)
    }

    const consumeLightningStrike = () => {
      const signal = lightningGroundStrikeSignal
      if (signal.version === lastLightningVersion) return
      lastLightningVersion = signal.version

      if (signal.scene === 'snow') {
        hasIgnited = true
        for (let i = 0; i < 14; i++) {
          spawnSpark(signal.index + Math.floor((Math.random() - 0.5) * 6), 1.02 + signal.strength * 0.28)
        }
        spawnSteam(signal.index, 0.34 + signal.strength * 0.20)
        spawnLightningSteam(signal.index, 0.94 + signal.strength * 0.56)
        spawnSmoke(signal.index, 0.42 + signal.strength * 0.24)
        spawnSmoke(signal.index + (Math.random() < 0.5 ? -2 : 2), 0.28 + signal.strength * 0.18)
      } else if (signal.scene === 'ember') {
        // The Storm layer already preserves Ember's established strike heat.
        // This only guarantees the persistent fire simulation is awake.
        hasIgnited = true
      } else if (signal.scene === 'rain') {
        hasIgnited = true
        spawnLightningSteam(signal.index, 1.10 + signal.strength * 0.72)
        spawnSteam(signal.index, 0.70 + signal.strength * 0.45)
        spawnSmoke(signal.index, 0.30 + signal.strength * 0.18)
        for (let i = 0; i < 7; i++) {
          spawnSpark(signal.index + Math.floor((Math.random() - 0.5) * 5), 0.78 + signal.strength * 0.20)
        }
      }
    }

    const spawnSmoke = (index: number, strength: number) => {
      if (strength <= 0.12) return
      const x = Math.min(width, index * 6) + (Math.random() - 0.5) * 6
      const y = fireSurfaceYAtIndex(index) - 4
      smoke.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -(0.08 + Math.random() * 0.14),
        life: 0.75 + Math.random() * 0.90,
        size: 4 + strength * 8 + Math.random() * 5,
      })
      if (smoke.length > 180) {
        const excess = smoke.length - 180
        smoke.copyWithin(0, excess)
        smoke.length = 180
      }
    }

    const spawnSpark = (index: number, strength: number, count = 1) => {
      if (strength < 0.28) return
      const x = Math.min(width, index * 6) + (Math.random() - 0.5) * 6
      const y = fireSurfaceYAtIndex(index) - 2
      for (let i = 0; i < count; i++) {
        const lift = Math.max(0, strength - 0.35)
        sparks.push({
          x: x + (Math.random() - 0.5) * 3.4,
          y: y - Math.random() * 1.8,
          vx: (Math.random() - 0.5) * (0.42 + lift * 0.18),
          vy: -(0.72 + Math.random() * 1.02 + lift * (0.18 + Math.random() * 0.24)),
          life: 0.36 + Math.random() * 0.34 + lift * Math.random() * 0.10,
          size: 0.85 + Math.random() * 1.08,
        })
      }
      if (sparks.length > 195) {
        const excess = sparks.length - 195
        sparks.copyWithin(0, excess)
        sparks.length = 195
      }
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = canvasPixelRatio(width, height, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ensureWorld(width, height)
      ensureFields()
    }

    const beginMeteor = (time: number) => {
      if (whooshSource) {
        const source = whooshSource
        const filter = whooshFilter
        const gain = whooshGain
        try { source.stop() } catch { /* already finished */ }
        disconnectWhoosh(source, filter, gain)
      }
      meteorStartedAt = time
      impacted = false
      trail = []
      fragments = []
      chooseTrajectory()
    }

    const applyImpact = (time: number) => {
      if (impacted) return
      impacted = true
      hasIgnited = true
      emberPurgeActive = true
      impactAt = time
      impactIndex = worldIndexAt(targetX, width)

      const impactRadius = 10
      for (let offset = -impactRadius; offset <= impactRadius; offset++) {
        const idx = impactIndex + offset
        if (idx <= 1 || idx >= pitchWorld.drifts.length - 2) continue
        const normalized = Math.abs(offset) / impactRadius
        const strength = Math.max(0, 1 - normalized * normalized)

        pitchWorld.drifts[idx] = Math.max(0, pitchWorld.drifts[idx] - 9.2 * strength)
        const evaporated = pitchWorld.water[idx] * strength * 0.94
        pitchWorld.water[idx] = Math.max(0, pitchWorld.water[idx] - evaporated)
        pitchWorld.ice[idx] = Math.max(0, pitchWorld.ice[idx] - strength * 1.10)
        if (evaporated > 0.02 || pitchWorld.waterLevel > 0.025) {
          spawnSteam(idx, 0.72 + strength * 1.20 + evaporated * 0.28)
        }
        residue[idx] = Math.max(residue[idx], strength * 0.42)
      }

      // Ember is a world-transforming event, not a local hydrology interaction.
      // Flash-boil enough of the shared flood plane to feel violent without
      // carving a geometric notch into the water/ice surface.
      if (pitchWorld.waterLevel > 0.025) {
        spawnLightningSteam(impactIndex, 1.70)
        spawnLightningSteam(Math.max(1, impactIndex - 4), 1.18)
        spawnLightningSteam(Math.min(pitchWorld.water.length - 2, impactIndex + 4), 1.18)
      }
      pitchWorld.waterLevel = Math.max(0, pitchWorld.waterLevel - 0.085)

      targetY = emberSurfaceYAtX(targetX)

      for (let offset = -2; offset <= 2; offset++) {
        const idx = impactIndex + offset
        if (idx > 0 && idx < fire.length - 1) fire[idx] = Math.max(fire[idx], 0.85 - Math.abs(offset) * 0.12)
      }

      fragments = Array.from({ length: 24 }, () => {
        const angle = Math.PI * (1.08 + Math.random() * 0.84)
        const force = 1.6 + Math.random() * 4.8
        return {
          x: targetX,
          y: targetY - 3,
          vx: Math.cos(angle) * force,
          vy: Math.sin(angle) * force - 1.2,
          life: 0.55 + Math.random() * 0.65,
          size: 0.7 + Math.random() * 1.5,
        }
      })

      for (let k = 0; k < 10; k++) spawnSpark(impactIndex + Math.floor((Math.random() - 0.5) * 3), 1)

      impactSound()
      syncFireSound()
      saveWorld()
    }

    const updateFire = (time: number, dt: number) => {
      if (!hasIgnited) return
      ensureFields()

      const scaled = (dt / 16.67) * speedRef.current
      fireSnapshot.set(fire)
      const previous = fireSnapshot
      fire[0] = 0
      fire[fire.length - 1] = 0
      residue[0] = 0
      residue[residue.length - 1] = 0
      let totalHeat = 0
      let maxHeat = 0
      let maxResidue = 0
      const impactAge = (time - impactAt) / 1000

      // Keep an ignition source alive briefly at the strike point.
      if (impactAge < 4.2) {
        for (let offset = -3; offset <= 3; offset++) {
          const idx = impactIndex + offset
          if (idx <= 0 || idx >= previous.length - 1) continue
          const strength = Math.max(0, 1 - Math.abs(offset) / 4)
          previous[idx] = Math.max(previous[idx], 0.72 * strength + Math.max(0, 0.35 - impactAge * 0.08))
        }
      }

      for (let i = 1; i < previous.length - 1; i++) {
        const here = previous[i]
        const neighbor = Math.max(previous[i - 1], previous[i + 1])
        const randomBias = 0.97 + seeded(i) * 0.035
        const snow = pitchWorld.drifts[i]
        // Once Ember lands, standing water/ice becomes fuel for steam rather than
        // a brake on the scene. Snow keeps its established resistance/melt behaviour.
        const moisture = Math.min(0.55, snow * 0.018)

        let heat = here * Math.pow(0.9965, scaled)
        const weatherSuppression = rainMix * 0.105 + snowMix * 0.058
        const spread = neighbor * (0.985 + randomBias * 0.007 - moisture * 0.070 - weatherSuppression)
        heat = Math.max(heat, spread)

        if (neighbor > 0.20 && residue[i] > 0.05) {
          heat = Math.max(heat, neighbor * (0.986 + randomBias * 0.004))
        }

        if (residue[i] > 0.20) {
          // Char remembers heat but is not an infinite fuel source. A burned
          // patch can smoulder for a while, then cool into a visible scar.
          heat = Math.max(heat, residue[i] * 0.045)
        }

        heat *= 1 - Math.min(0.32, moisture * 0.18)

        // Incoming rain/snow cools the persistent fire rather than replacing it.
        const weatherScale = dt / 16.67
        const cooling =
          rainMix * 0.0028 * weatherScale +
          snowMix * 0.0014 * weatherScale
        const cooled = Math.min(heat, cooling * (0.72 + seeded(i * 5) * 0.42))
        if (cooled > 0) {
          heat -= cooled
          if (Math.random() < Math.min(0.18, cooled * 18)) {
            spawnSteam(i, cooled * (rainMix > snowMix ? 12 : 9))
          }
        }

        residue[i] = Math.max(
          0,
          residue[i] -
            (rainMix * 0.00115 + snowMix * 0.00058) * weatherScale
        )

        heat = Math.max(0, Math.min(1, heat))
        fire[i] = heat
        totalHeat += heat
        if (heat > maxHeat) maxHeat = heat
        if (residue[i] > maxResidue) maxResidue = residue[i]

        if (heat > 0.06) {
          residue[i] = Math.min(1, residue[i] + heat * 0.00145 * scaled)

          const melt = Math.min(pitchWorld.drifts[i], heat * 0.176 * scaled)
          if (melt > 0) {
            pitchWorld.drifts[i] = Math.max(0, pitchWorld.drifts[i] - melt)
            spawnSteam(i, melt)
          }

          const thaw = Math.min(pitchWorld.ice[i] || 0, heat * 0.020 * scaled)
          if (thaw > 0) {
            pitchWorld.ice[i] = Math.max(0, pitchWorld.ice[i] - thaw)
            if (Math.random() < Math.min(0.38, 0.08 + thaw * 5.5)) spawnSteam(i, thaw * 2.2)
          }

          const evap = Math.min(pitchWorld.water[i], heat * 0.115 * scaled)
          if (evap > 0) {
            pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - evap)
            if (Math.random() < Math.min(0.36, 0.07 + evap * 1.7)) spawnSteam(i, evap * 2.0)
          }

          // The advancing fire front visibly hisses through the flood/ice while
          // the shared water level drops as one coherent plane.
          if (pitchWorld.waterLevel > 0.025 && Math.random() < Math.min(0.065, heat * 0.050 * scaled)) {
            spawnSteam(i, 0.20 + heat * pitchWorld.waterLevel * 0.95)
          }

          if (heat > 0.34 && Math.random() < 0.0195 * scaled) spawnSpark(i, heat)
          if (heat > 0.62 && Math.random() < 0.0022 * scaled) {
            spawnSpark(i, heat, 2 + Math.floor(Math.random() * 3))
          }
          if ((heat > 0.20 || residue[i] > 0.34) && Math.random() < 0.010 * scaled) {
            spawnSmoke(i, Math.max(heat, residue[i] * 0.8))
          }
        } else {
          residue[i] = Math.max(0, residue[i] - 0.000018 * scaled)
          if (residue[i] > 0.28 && Math.random() < 0.004 * scaled) {
            spawnSmoke(i, residue[i] * 0.7)
          }
        }
      }

      pitchWorld.ember = fire
      pitchWorld.char = residue

      const heatCoverage = Math.min(1, totalHeat / Math.max(1, fire.length * 0.20))

      if (emberPurgeActive) {
        // Ember deliberately returns the material state to dry terrain quickly.
        // The flood remains perfectly level while it falls away, so there are no
        // local water craters; steam along the fire front carries the transition.
        const purgeRate = (0.00135 + heatCoverage * 0.00090) * scaled * Math.max(0.62, 1 - rainMix * 0.40)
        pitchWorld.waterLevel = Math.max(0, pitchWorld.waterLevel - purgeRate)
        pitchWorld.wetness = Math.max(0, pitchWorld.wetness - (0.0015 + heatCoverage * 0.0012) * scaled)

        for (let i = 1; i < pitchWorld.ice.length - 1; i++) {
          pitchWorld.ice[i] = Math.max(0, pitchWorld.ice[i] - (0.0048 + heatCoverage * 0.0030) * scaled)
          pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - (0.030 + heatCoverage * 0.055) * scaled)
        }

  
        if (pitchWorld.waterLevel <= 0.025) {
          pitchWorld.waterLevel = 0
          pitchWorld.water.fill(0)
          pitchWorld.ice.fill(0)
          pitchWorld.wetness = 0
          emberPurgeActive = false
        }
      } else {
        pitchWorld.wetness = Math.max(0, pitchWorld.wetness - 0.0005 * scaled * Math.max(0.15, 1 - rainMix))
      }

      // `hasIgnited` used to remain latched forever after the first strike/meteor,
      // leaving this whole-world simulation running at ~30 Hz for the rest of an
      // overnight session. Keep the accepted cooling/char aftermath intact, then
      // genuinely put Ember to sleep once every visible/fuel-bearing trace is gone.
      if (!emberPurgeActive && impactAge >= 4.2 && maxHeat < 0.008 && maxResidue < 0.03) {
        hasIgnited = false
        for (let i = 0; i < fire.length; i++) {
          if (fire[i] < 0.008) fire[i] = 0
          if (residue[i] < 0.03) residue[i] = 0
        }
      }

      if (impactAge >= 4.2 && fragments.length === 0) {
        impacted = false
        meteorStartedAt = -1
        trail.length = 0
      }

      if (fireGain && audioCtx) {
        const level = soundOnRef.current ? Math.min(0.085, 0.018 + totalHeat / fire.length * 0.18) : 0
        if (fireGain !== lastFireLevelNode) {
          lastFireLevelNode = fireGain
          lastFireLevel = Number.NaN
        }
        if (level !== lastFireLevel) {
          setContinuousAudioTarget(fireGain.gain, level, audioCtx.currentTime, 0.25)
          lastFireLevel = level
        }
      } else {
        lastFireLevelNode = null
        lastFireLevel = Number.NaN
      }
    }

    const drawMeteor = (time: number, render: boolean) => {
      if (meteorStartedAt < 0 || impacted) return

      const elapsed = time - meteorStartedAt
      const fallDuration = 2250 / Math.min(1.35, 0.92 + Math.sqrt(speedRef.current) * 0.08)

      startWhoosh()

      const raw = Math.min(1, elapsed / fallDuration)
      const t = raw * (0.34 + raw * 0.66)
      const x = startX + (targetX - startX) * t
      const y = startY + (targetY - startY) * t

      trail.push({ x, y, age: time })
      if (trail.length > 16) {
        trail.copyWithin(0, trail.length - 16)
        trail.length = 16
      }

      if (render) {
        for (let i = 0; i < trail.length; i++) {
          const point = trail[i]
          const age = Math.min(1, (time - point.age) / 460)
          const alpha = (1 - age) * (0.05 + raw * 0.20) * (i / trail.length)
          const radius = 0.8 + (i / trail.length) * (1.5 + raw * 1.6)
          ctx.beginPath()
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(191, 92, 39, ${alpha})`
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(x, y, 2.2 + raw * 2.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(165, 65, 25, ${0.34 + raw * 0.28})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, 1.15 + raw * 1.25, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(238, 151, 82, ${0.58 + raw * 0.30})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x - 0.4, y - 0.4, 0.65 + raw * 0.45, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 224, 176, ${0.70 + raw * 0.24})`
        ctx.fill()

        if (raw > 0.72) {
          const warmth = (raw - 0.72) / 0.28
          const groundWidth = 24 + warmth * 80
          ctx.fillStyle = `rgba(118, 42, 18, ${warmth * 0.042})`
          ctx.fillRect(targetX - groundWidth / 2, targetY - 2, groundWidth, 4)
        }
      }

      if (raw >= 1) applyImpact(time)
    }

    const drawImpact = (time: number, dt: number, render: boolean) => {
      if (!impacted) return
      const age = (time - impactAt) / 1000

      if (render && age < 0.11) {
        const flash = 1 - age / 0.11
        ctx.fillStyle = `rgba(216, 154, 101, ${flash * 0.065})`
        ctx.fillRect(0, 0, width, height)
      }

      const dtScale = dt / 16.67
      let fragmentWrite = 0
      for (let fragmentRead = 0; fragmentRead < fragments.length; fragmentRead++) {
        const fragment = fragments[fragmentRead]
        if (fragment.life <= 0) continue
        fragment.vy += 0.11 * dtScale
        fragment.x += fragment.vx * dtScale
        fragment.y += fragment.vy * dtScale
        fragment.life -= 0.018 * dtScale
        if (fragment.life <= 0) continue

        if (render) {
          ctx.fillStyle = `rgba(224, 91, 35, ${fragment.life * 0.52})`
          ctx.fillRect(fragment.x, fragment.y, fragment.size, fragment.size)
        }
        fragments[fragmentWrite++] = fragment
      }
      fragments.length = fragmentWrite
    }

    const drawFire = (time: number, dt: number, render: boolean) => {
      if (
        !hasIgnited &&
        !impacted &&
        meteorStartedAt < 0 &&
        sparks.length === 0 &&
        steam.length === 0 &&
        smoke.length === 0
      ) return

      const t = time * 0.001

      if (render) for (let i = 1; i < fire.length - 1; i++) {
        const heat = fire[i]
        const char = residue[i]
        if (heat < 0.02 && char < 0.03) continue

        const x = Math.min(width, i * 6)
        const surface = fireSurfaceYAtIndex(i)

        if (char > 0.04) {
          ctx.beginPath()
          ctx.ellipse(x, surface + 1.6, 4.8 + char * 3.6, 2.2 + char * 2.6, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(17, 8, 7, ${Math.min(0.42, 0.10 + char * 0.24)})`
          ctx.fill()
        }

        if (heat > 0.025) {
          // Soft terrain-hugging glow instead of obvious vertical red bars.
          ctx.beginPath()
          ctx.ellipse(x, surface - 0.8, 5.2 + heat * 5.5, 2.4 + heat * 2.6, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(108, 26, 11, ${Math.min(0.26, heat * 0.18 + char * 0.08)})`
          ctx.fill()

          ctx.beginPath()
          ctx.ellipse(x, surface - 0.7, 2.4 + heat * 2.6, 1.0 + heat * 0.85, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(231, 102, 38, ${Math.min(0.56, heat * 0.36 + char * 0.10)})`
          ctx.fill()

          const frontness = Math.max(0, heat - residue[i] * 0.18)
          if (frontness > 0.12 && i % 2 === 0) {
            const flicker = 0.78 + Math.sin(t * 7.0 + i * 0.8) * 0.14 + seeded(i) * 0.10
            const flameH = 5.5 + frontness * 16 * flicker
            const flameW = 3.2 + frontness * 3.4

            // Rounder, broader early flame front — less pointy, more terrain-hugging.
            ctx.beginPath()
            ctx.moveTo(x - flameW, surface)
            ctx.bezierCurveTo(
              x - flameW * 0.95, surface - flameH * 0.28,
              x - flameW * 0.40, surface - flameH * 0.86,
              x, surface - flameH * 0.82
            )
            ctx.bezierCurveTo(
              x + flameW * 0.40, surface - flameH * 0.86,
              x + flameW * 0.95, surface - flameH * 0.30,
              x + flameW, surface
            )
            ctx.closePath()
            ctx.fillStyle = `rgba(236, 104, 39, ${Math.min(0.40, frontness * 0.34)})`
            ctx.fill()

            ctx.beginPath()
            ctx.moveTo(x - flameW * 0.52, surface - 0.3)
            ctx.bezierCurveTo(
              x - flameW * 0.35, surface - flameH * 0.24,
              x - flameW * 0.12, surface - flameH * 0.62,
              x, surface - flameH * 0.60
            )
            ctx.bezierCurveTo(
              x + flameW * 0.12, surface - flameH * 0.62,
              x + flameW * 0.35, surface - flameH * 0.26,
              x + flameW * 0.50, surface - 0.3
            )
            ctx.closePath()
            ctx.fillStyle = `rgba(255, 181, 97, ${Math.min(0.20, frontness * 0.16)})`
            ctx.fill()
          }
        }

        // Cooling char keeps a faint buried afterglow after the active front has passed.
        if (char > 0.065 && heat < 0.20) {
          const cooling = Math.max(0, 1 - heat / 0.20)
          const glowPulse = 0.82 + Math.sin(t * 1.35 + i * 0.57) * 0.10 + seeded(i * 7) * 0.08
          const glowAlpha = Math.min(0.17, (0.018 + char * 0.12) * cooling * glowPulse)

          ctx.beginPath()
          ctx.ellipse(
            x + (seeded(i * 13) - 0.5) * 1.8,
            surface - 0.25,
            1.25 + char * 2.1,
            0.42 + char * 0.52,
            0,
            0,
            Math.PI * 2
          )
          ctx.fillStyle = `rgba(132, 39, 18, ${glowAlpha})`
          ctx.fill()

          if (char > 0.12 && seeded(i * 17) > 0.62) {
            ctx.beginPath()
            ctx.ellipse(
              x + (seeded(i * 19) - 0.5) * 2.2,
              surface - 0.45,
              0.55 + char * 0.75,
              0.30 + char * 0.24,
              0,
              0,
              Math.PI * 2
            )
            ctx.fillStyle = `rgba(205, 70, 27, ${Math.min(0.15, glowAlpha * 1.35)})`
            ctx.fill()
          }
        }

        // Hot ember bed lingers behind the front.
        if (char > 0.18) {
          const pulse = 0.80 + Math.sin(t * 4.6 + i * 0.83) * 0.18 + seeded(i) * 0.10

          // Brighter continuous fire line in the late ember state.
          ctx.beginPath()
          ctx.ellipse(x, surface - 0.6, 2.0 + char * 1.8, 0.65 + char * 0.35, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(247, 116, 46, ${Math.min(0.44, char * 0.22 * pulse)})`
          ctx.fill()

          ctx.beginPath()
          ctx.ellipse(x + (seeded(i * 3) - 0.5) * 2, surface - 0.4, 1.3 + char * 1.5, 0.60 + char * 0.48, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 124, 58, ${Math.min(0.72, char * 0.40 * pulse)})`
          ctx.fill()

          if (char > 0.35 && i % 3 === 0) {
            ctx.fillStyle = `rgba(255, 189, 106, ${Math.min(0.30, char * 0.18 * pulse)})`
            ctx.fillRect(x - 0.6, surface - 1.25, 1.5, 0.82)
          }
        }
      }

      const dtScale = dt / 16.67

      let sparkWrite = 0
      for (let sparkRead = 0; sparkRead < sparks.length; sparkRead++) {
        const particle = sparks[sparkRead]
        if (particle.life <= 0) continue
        particle.x += particle.vx * dtScale
        particle.y += particle.vy * dtScale
        particle.vy += 0.018 * dtScale
        particle.life -= 0.015 * dtScale
        if (particle.life <= 0) continue

        if (render) {
          ctx.fillStyle = `rgba(241, 121, 46, ${particle.life * 0.72})`
          ctx.fillRect(particle.x, particle.y, particle.size, particle.size)
        }
        sparks[sparkWrite++] = particle
      }
      sparks.length = sparkWrite

      let steamWrite = 0
      for (let steamRead = 0; steamRead < steam.length; steamRead++) {
        const plume = steam[steamRead]
        if (plume.life <= 0) continue
        plume.x += plume.vx * dtScale
        plume.y += plume.vy * dtScale
        plume.vx += Math.sin(t * 2.2 + plume.y * 0.03) * 0.002
        plume.life -= 0.0065 * dtScale
        if (plume.life <= 0) continue

        if (render) {
          ctx.beginPath()
          ctx.ellipse(plume.x, plume.y, plume.size, plume.size * 0.42, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(188, 193, 198, ${plume.life * plume.opacity})`
          ctx.fill()
        }
        steam[steamWrite++] = plume
      }
      steam.length = steamWrite

      let smokeWrite = 0
      for (let smokeRead = 0; smokeRead < smoke.length; smokeRead++) {
        const plume = smoke[smokeRead]
        if (plume.life <= 0) continue
        plume.x += plume.vx * dtScale
        plume.y += plume.vy * dtScale
        plume.vx += Math.sin(t * 1.6 + plume.y * 0.02) * 0.0015
        plume.life -= 0.0048 * dtScale
        if (plume.life <= 0) continue

        if (render) {
          ctx.beginPath()
          ctx.ellipse(plume.x, plume.y, plume.size, plume.size * 0.58, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(70, 62, 58, ${plume.life * 0.040})`
          ctx.fill()
        }
        smoke[smokeWrite++] = plume
      }
      smoke.length = smokeWrite
    }

    resize()
    syncFireSound()
    let fireCarry = 0
    let lastVisualFrame = 0

    const draw = (time: number) => {
      const dt = Math.min(34, time - last)
      last = time

      const transitionBlend = 1 - Math.exp(-dt / 900)
      rainMix += ((rainActiveRef.current ? 1 : 0) - rainMix) * transitionBlend
      snowMix += ((snowActiveRef.current ? 1 : 0) - snowMix) * transitionBlend

      const isActive = activeRef.current
      if (isActive && !wasActive) beginMeteor(time)
      wasActive = isActive

      const externalId = externalMeteorIdRef.current
      if (externalId > 0 && externalId !== lastExternalMeteorId) {
        lastExternalMeteorId = externalId
        beginMeteor(time)
      }

      consumeWorldReset(time)
      consumeLightningStrike()
      syncFireSound()
      fireCarry += dt
      if (fireCarry >= 30) {
        updateFire(time, Math.min(66, fireCarry))
        fireCarry = 0
        // updateFire can be the moment the final invisible heat/char disappears.
        syncFireSound()
      }

      const highMotion = (meteorStartedAt >= 0 && !impacted) || (impacted && time - impactAt < 1_450)
      const hasTransientVisuals = fragments.length > 0 || sparks.length > 0 || steam.length > 0 || smoke.length > 0
      const fullyDormant = !hasIgnited && meteorStartedAt < 0 && !impacted && !emberPurgeActive && !hasTransientVisuals

      if (fullyDormant) {
        // Five lightweight checks per second are enough to catch a new meteor,
        // scene activation, world reset, or lightning strike without burning a
        // display-rate animation loop for hours while Ember is visually absent.
        if (visibleRef.current && lastVisualFrame !== -1) {
          ctx.clearRect(0, 0, width, height)
          lastVisualFrame = -1
        }
        idleTimer = window.setTimeout(() => {
          idleTimer = 0
          raf = requestAnimationFrame(draw)
        }, 200)
        return
      }

      // The meteor/impact needs display-rate motion. Persistent fire/char is a
      // slower organic surface and remains visually smooth at ~30 Hz.
      const render = visibleRef.current && (highMotion || time - lastVisualFrame >= 30)
      if (render) lastVisualFrame = time
      if (render) ctx.clearRect(0, 0, width, height)
      drawMeteor(time, render)
      drawImpact(time, dt, render)
      drawFire(time, dt, render)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(idleTimer)
      window.clearTimeout(fireStopTimer)
      window.removeEventListener('resize', resize)
      if (whooshGain && audioCtx) whooshGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05)
      if (fireGain && audioCtx) setContinuousAudioTarget(fireGain.gain, 0, audioCtx.currentTime, 0.18)
      const endingWhooshSource = whooshSource
      const endingWhooshFilter = whooshFilter
      const endingWhooshGain = whooshGain
      const endingFireSource = fireSource
      const endingFireFilter = fireFilter
      const endingFireGain = fireGain
      try { endingWhooshSource?.stop() } catch { /* already finished */ }
      try { endingFireSource?.stop() } catch { /* already finished */ }
      disconnectWhoosh(endingWhooshSource, endingWhooshFilter, endingWhooshGain)
      disconnectFire(endingFireSource, endingFireFilter, endingFireGain)
    }
  }, [])

  return (
    <div className="ember-scene">
      <canvas className="scene-canvas" ref={canvasRef} aria-label="Meteor impact and spreading ember fire scene" />
    </div>
  )
}


