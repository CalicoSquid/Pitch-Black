export type StormSignal = {
  mix: number
  wind: number
  flash: number
}

export const stormSignal: StormSignal = {
  mix: 0,
  wind: 0,
  flash: 0,
}

export const worldResetSignal = {
  version: 0,
}

export type PitchWorld = {
  ground: Float32Array
  drifts: Float32Array
  water: Float32Array
  ice: Float32Array
  ember: Float32Array
  char: Float32Array
  width: number
  height: number
  wetness: number
  cloudCover: number
}

const DESKTOP_GROUND_LEVEL_RATIO = 0.888
const MOBILE_GROUND_LEVEL_RATIO = 0.85
const MOBILE_BREAKPOINT = 620
const MIN_UI_QUIET_ZONE_DESKTOP = 82
const MIN_UI_QUIET_ZONE_MOBILE = 106
const WORLD_STORAGE_KEY = 'pitchblack-world-v3'

export const pitchWorld: PitchWorld = {
  ground: new Float32Array(1),
  drifts: new Float32Array(1),
  water: new Float32Array(1),
  ice: new Float32Array(1),
  ember: new Float32Array(1),
  char: new Float32Array(1),
  width: 0,
  height: 0,
  wetness: 0,
  cloudCover: 0.12,
}

function loadWorld() {
  try {
    const raw = window.localStorage.getItem(WORLD_STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as {
      ground?: number[]
      drifts?: number[]
      water?: number[]
      ice?: number[]
      ember?: number[]
      char?: number[]
      width?: number
      height?: number
      wetness?: number
      cloudCover?: number
    }

    if (
      Array.isArray(saved.ground) &&
      Array.isArray(saved.drifts) &&
      saved.ground.length > 2 &&
      saved.ground.length === saved.drifts.length
    ) {
      pitchWorld.ground = Float32Array.from(saved.ground)
      pitchWorld.drifts = Float32Array.from(saved.drifts)
      pitchWorld.water = Array.isArray(saved.water) && saved.water.length === saved.drifts.length
        ? Float32Array.from(saved.water)
        : new Float32Array(saved.drifts.length)
      pitchWorld.ice = Array.isArray(saved.ice) && saved.ice.length === saved.drifts.length
        ? Float32Array.from(saved.ice)
        : new Float32Array(saved.drifts.length)
      pitchWorld.ember = Array.isArray(saved.ember) && saved.ember.length === saved.drifts.length
        ? Float32Array.from(saved.ember)
        : new Float32Array(saved.drifts.length)
      pitchWorld.char = Array.isArray(saved.char) && saved.char.length === saved.drifts.length
        ? Float32Array.from(saved.char)
        : new Float32Array(saved.drifts.length)
      pitchWorld.width = Math.max(0, Number(saved.width) || 0)
      pitchWorld.height = Math.max(0, Number(saved.height) || 0)
      pitchWorld.wetness = Math.max(0, Math.min(1, Number(saved.wetness) || 0))
      pitchWorld.cloudCover = Math.max(0, Math.min(1, Number(saved.cloudCover) || 0.12))
    }
  } catch {
    // A corrupt saved world should never stop PitchBlack loading.
  }
}

export function resetWorld() {
  pitchWorld.drifts.fill(0)
  pitchWorld.water.fill(0)
  pitchWorld.ice.fill(0)
  pitchWorld.ember.fill(0)
  pitchWorld.char.fill(0)
  pitchWorld.wetness = 0
  pitchWorld.cloudCover = 0.12
  worldResetSignal.version += 1
  saveWorld()
}

export function saveWorld() {
  try {
    window.localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify({
      ground: Array.from(pitchWorld.ground),
      drifts: Array.from(pitchWorld.drifts),
      water: Array.from(pitchWorld.water),
      ice: Array.from(pitchWorld.ice),
      ember: Array.from(pitchWorld.ember),
      char: Array.from(pitchWorld.char),
      width: pitchWorld.width,
      height: pitchWorld.height,
      wetness: pitchWorld.wetness,
      cloudCover: pitchWorld.cloudCover,
    }))
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

if (typeof window !== 'undefined') loadWorld()

function resampleArray(source: Float32Array, targetLength: number) {
  const next = new Float32Array(targetLength)
  if (source.length < 2) return next

  for (let i = 0; i < targetLength; i++) {
    const t = i / Math.max(1, targetLength - 1)
    const oldPos = t * (source.length - 1)
    const a = Math.floor(oldPos)
    const b = Math.min(source.length - 1, a + 1)
    const mix = oldPos - a
    next[i] = source[a] * (1 - mix) + source[b] * mix
  }
  return next
}

export function ensureWorld(width: number, height: number) {
  const targetLength = Math.ceil(width / 6) + 3
  const sameShape =
    pitchWorld.ground.length === targetLength &&
    pitchWorld.drifts.length === targetLength &&
    pitchWorld.water.length === targetLength &&
    pitchWorld.ice.length === targetLength &&
    pitchWorld.ember.length === targetLength &&
    pitchWorld.char.length === targetLength &&
    pitchWorld.width === width &&
    pitchWorld.height === height

  if (sameShape) return

  const hadWorld =
    pitchWorld.ground.length > 2 &&
    pitchWorld.drifts.length === pitchWorld.ground.length &&
    pitchWorld.width > 0

  let nextGround: Float32Array
  let nextSnow: Float32Array
  let nextWater: Float32Array
  let nextIce: Float32Array
  let nextEmber: Float32Array
  let nextChar: Float32Array

  if (hadWorld) {
    nextGround = resampleArray(pitchWorld.ground, targetLength)
    nextSnow = resampleArray(pitchWorld.drifts, targetLength)
    nextWater = resampleArray(pitchWorld.water, targetLength)
    nextIce = resampleArray(pitchWorld.ice, targetLength)
    nextEmber = resampleArray(pitchWorld.ember, targetLength)
    nextChar = resampleArray(pitchWorld.char, targetLength)
  } else {
    nextGround = new Float32Array(targetLength)
    nextSnow = new Float32Array(targetLength)
    nextWater = new Float32Array(targetLength)
    nextIce = new Float32Array(targetLength)
    nextEmber = new Float32Array(targetLength)
    nextChar = new Float32Array(targetLength)

    // Permanent terrain: broad, shallow undulation around the shared world floor.
    // Positive values raise the ground; negative values form shallow basins.
    for (let i = 0; i < targetLength; i++) {
      const broad =
        Math.sin(i * 0.034 + 0.8) * 2.6 +
        Math.sin(i * 0.013 + 2.1) * 3.3 +
        Math.sin(i * 0.091 + 1.6) * 0.9
      nextGround[i] = broad
      nextSnow[i] = 0.9 + Math.max(0, Math.sin(i * 0.11) * 0.35)
    }
  }

  pitchWorld.ground = nextGround
  pitchWorld.drifts = nextSnow
  pitchWorld.water = nextWater
  pitchWorld.ice = nextIce
  pitchWorld.ember = nextEmber
  pitchWorld.char = nextChar
  pitchWorld.width = width
  pitchWorld.height = height
}

export function worldBaseY(height = pitchWorld.height) {
  const width = pitchWorld.width
  const mobile = width > 0 && width <= MOBILE_BREAKPOINT
  const ratio = mobile ? MOBILE_GROUND_LEVEL_RATIO : DESKTOP_GROUND_LEVEL_RATIO
  const minQuietZone = mobile ? MIN_UI_QUIET_ZONE_MOBILE : MIN_UI_QUIET_ZONE_DESKTOP

  // Keep only enough foreground clearance for the dock to live beneath the weather.
  // The normal ratio stays close to the original composition; short viewports retain
  // a pixel safety floor so the controls cannot climb into the terrain.
  return Math.min(height * ratio, Math.max(0, height - minQuietZone))
}

export function worldIndexAt(x: number, width = pitchWorld.width) {
  if (pitchWorld.drifts.length < 2 || width <= 0) return 0
  return Math.max(
    0,
    Math.min(
      pitchWorld.drifts.length - 1,
      Math.floor((x / width) * (pitchWorld.drifts.length - 1))
    )
  )
}

export function terrainClearanceLiftAtIndex(index: number) {
  const last = pitchWorld.ground.length - 1
  if (last <= 0) return 0

  // A very broad, shallow rise beneath the dock gives the controls a little natural
  // breathing room without turning the lower screen into an obvious reserved UI band.
  // Polynomial shaping keeps this cheap in the render hot path.
  const i = Math.max(0, Math.min(last, index))
  const distance = Math.abs(i / last - 0.5) / 0.28
  if (distance >= 1) return 0
  const shoulder = 1 - distance * distance
  const maxLift = pitchWorld.width > 0 && pitchWorld.width <= MOBILE_BREAKPOINT ? 7 : 5
  return maxLift * shoulder * shoulder
}

export function groundSurfaceYAtIndex(index: number, height = pitchWorld.height) {
  const i = Math.max(0, Math.min(pitchWorld.ground.length - 1, index))
  return worldBaseY(height) - pitchWorld.ground[i] - terrainClearanceLiftAtIndex(i)
}

export function snowSurfaceYAtIndex(index: number, height = pitchWorld.height) {
  const i = Math.max(0, Math.min(pitchWorld.drifts.length - 1, index))
  return groundSurfaceYAtIndex(i, height) - pitchWorld.drifts[i]
}

export function surfaceYAt(x: number, width = pitchWorld.width, height = pitchWorld.height) {
  return snowSurfaceYAtIndex(worldIndexAt(x, width), height)
}

