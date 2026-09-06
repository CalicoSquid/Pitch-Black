import type { Scene } from '../types'

export type LightningGroundStrikeSignal = {
  version: number
  index: number
  x: number
  strength: number
  scene: Scene
}

export const lightningGroundStrikeSignal: LightningGroundStrikeSignal = {
  version: 0,
  index: 0,
  x: 0,
  strength: 0,
  scene: 'black',
}

export function publishLightningGroundStrike(
  index: number,
  x: number,
  strength: number,
  scene: Scene,
) {
  lightningGroundStrikeSignal.index = index
  lightningGroundStrikeSignal.x = x
  lightningGroundStrikeSignal.strength = strength
  lightningGroundStrikeSignal.scene = scene
  lightningGroundStrikeSignal.version += 1
}

export type LightningIgnitionSignal = {
  version: number
  index: number
  x: number
  strength: number
  scene: Scene
}

/**
 * Separate from a generic ground strike: this only advances when the strike
 * actually seeds the persistent ember/fire field. Ambient actors can therefore
 * react to the consequence, not merely to a bolt touching terrain.
 */
export const lightningIgnitionSignal: LightningIgnitionSignal = {
  version: 0,
  index: 0,
  x: 0,
  strength: 0,
  scene: 'black',
}

export function publishLightningIgnition(
  index: number,
  x: number,
  strength: number,
  scene: Scene,
) {
  lightningIgnitionSignal.index = index
  lightningIgnitionSignal.x = x
  lightningIgnitionSignal.strength = strength
  lightningIgnitionSignal.scene = scene
  lightningIgnitionSignal.version += 1
}

export const LIGHTNING_FLASH_EVENT = 'tqw:lightning-flash'

export function publishLightningFlash() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIGHTNING_FLASH_EVENT))
}
