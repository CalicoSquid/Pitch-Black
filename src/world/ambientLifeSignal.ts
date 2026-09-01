export const ambientTrainSignal = {
  active: false,
  id: 0,
  progress: 0,
  direction: 1,
  alpha: 0,
  x: 0,
  scale: 1,
  startY: 0.765,
  travelY: -0.115,
  startScale: 1.08,
  endScale: 0.48,
}

export function publishAmbientTrain(
  id: number,
  progress: number,
  direction: number,
  alpha: number,
  x: number,
  scale: number,
  startY: number,
  travelY: number,
  startScale: number,
  endScale: number,
) {
  ambientTrainSignal.active = alpha > 0.001
  ambientTrainSignal.id = id
  ambientTrainSignal.progress = Math.max(0, Math.min(1, progress))
  ambientTrainSignal.direction = direction < 0 ? -1 : 1
  ambientTrainSignal.alpha = Math.max(0, Math.min(1, alpha))
  ambientTrainSignal.x = x
  ambientTrainSignal.scale = Math.max(0.1, Math.min(1.8, scale))
  ambientTrainSignal.startY = startY
  ambientTrainSignal.travelY = travelY
  ambientTrainSignal.startScale = startScale
  ambientTrainSignal.endScale = endScale
}

export function clearAmbientTrain() {
  ambientTrainSignal.active = false
  ambientTrainSignal.alpha = 0
}
