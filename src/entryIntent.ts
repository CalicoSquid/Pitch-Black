import type { LayerState, Scene } from './types'

export type PitchPreferences = {
  scene: Scene
  showClock: boolean
  soundOn: boolean
  volume: number
  aliveOn: boolean
  layers: LayerState
}

export type EntryMode = 'rain' | 'clock' | 'sunrise'

export function readEntryMode(search: string): EntryMode | null {
  const entry = new URLSearchParams(search).get('entry')
  return entry === 'rain' || entry === 'clock' || entry === 'sunrise' ? entry : null
}

export function applyEntryMode(preferences: PitchPreferences, entryMode: EntryMode | null): PitchPreferences {
  if (entryMode === 'rain') return { ...preferences, scene: 'rain', aliveOn: false }
  if (entryMode === 'clock') return { ...preferences, showClock: true }
  return preferences
}

export function preferencesForEntryPersistence(
  current: PitchPreferences,
  saved: PitchPreferences,
  entryMode: EntryMode | null,
  worldClaimed: boolean,
  clockClaimed: boolean,
): PitchPreferences {
  const next = { ...current }
  if (entryMode === 'rain' && !worldClaimed) {
    next.scene = saved.scene
    next.aliveOn = saved.aliveOn
  }
  if (entryMode === 'clock' && !clockClaimed) next.showClock = saved.showClock
  return next
}
