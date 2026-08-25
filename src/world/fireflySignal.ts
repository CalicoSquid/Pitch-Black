const MAX_FIREFLIES = 24

export const fireflySignal = {
  positions: new Float32Array(MAX_FIREFLIES * 2),
  ids: new Int32Array(MAX_FIREFLIES),
  extinguishRequests: new Int32Array(MAX_FIREFLIES),
  count: 0,
}
