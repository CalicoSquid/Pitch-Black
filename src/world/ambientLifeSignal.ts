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

export const ambientLanternSignal = {
  active: false,
  id: 0,
  progress: 0,
  direction: 1,
  alpha: 0,
  x: 0,
  scale: 1,
  stepPhase: 0,
  stepIndex: 0,
  walking: true,
  reaction: 'none' as 'none' | 'panic' | 'turning' | 'returning',
}

export const ambientInteractionSignal = {
  owlHootVersion: 0,
}

export function publishAmbientOwlHoot() {
  ambientInteractionSignal.owlHootVersion += 1
}

export function publishAmbientLantern(
  id: number,
  progress: number,
  direction: number,
  alpha: number,
  x: number,
  scale: number,
  stepPhase: number,
  stepIndex: number,
  walking: boolean,
  reaction: 'none' | 'panic' | 'turning' | 'returning' = 'none',
) {
  ambientLanternSignal.active = alpha > 0.001
  ambientLanternSignal.id = id
  ambientLanternSignal.progress = Math.max(0, Math.min(1, progress))
  ambientLanternSignal.direction = direction < 0 ? -1 : 1
  ambientLanternSignal.alpha = Math.max(0, Math.min(1, alpha))
  ambientLanternSignal.x = x
  ambientLanternSignal.scale = Math.max(0.6, Math.min(1.5, scale))
  ambientLanternSignal.stepPhase = Math.max(0, Math.min(1, stepPhase))
  ambientLanternSignal.stepIndex = Math.max(0, Math.floor(stepIndex))
  ambientLanternSignal.walking = walking
  ambientLanternSignal.reaction = reaction
}

export function clearAmbientLantern() {
  ambientLanternSignal.active = false
  ambientLanternSignal.alpha = 0
  ambientLanternSignal.reaction = 'none'
}
