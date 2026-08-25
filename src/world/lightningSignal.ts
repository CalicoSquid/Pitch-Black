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
