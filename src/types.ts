export type Scene = 'black' | 'snow' | 'rain' | 'ember'

export type LayerState = {
  moon: boolean
  storm: boolean
  fireflies: boolean
}

export type LayerKey = keyof LayerState
