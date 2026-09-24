// All procedural layers share a rendering budget. RAM alone is not a useful
// graphics benchmark (and Firefox does not expose navigator.deviceMemory).
const PROFILES = [
  { name: 'full', fps: 60, pixels: 4_000_000, totalPixels: 16_000_000 },
  { name: 'balanced', fps: 30, pixels: 1_500_000, totalPixels: 8_000_000 },
  { name: 'low', fps: 30, pixels: 750_000, totalPixels: 4_000_000 },
] as const

// One-way for this page visit: an idle black scene must not promote the next
// snowstorm back to a quality level that has already overwhelmed the device.
export class RenderGovernor {
  level: number
  private duration = 0
  private slowDuration = 0

  constructor(level = 0) { this.level = level }

  resetSamples() { this.duration = 0; this.slowDuration = 0 }

  observe(frameGap: number, workMs: number): boolean {
    const sample = Math.min(250, Math.max(0, frameGap))
    const budget = 1000 / PROFILES[this.level].fps
    this.duration += sample
    if (frameGap > budget * 1.5 || workMs > budget * 0.8) this.slowDuration += sample
    if (this.duration < 1800) return false
    const overloaded = this.slowDuration / this.duration > 0.4
    this.resetSamples()
    if (!overloaded || this.level === PROFILES.length - 1) return false
    this.level += 1
    return true
  }
}

const governor = new RenderGovernor()
type Surface = { resize: () => void }
const surfaces = new Set<Surface>()
let initialized = false

function publishBudget() {
  document.documentElement.dataset.renderQuality = PROFILES[governor.level].name
  for (const surface of surfaces) surface.resize()
}

function initialize() {
  if (initialized) return
  initialized = true
  const quality = new URLSearchParams(window.location.search).get('quality')
  // Start ARM/Linux conservatively, including Raspberry Pi Firefox. Other
  // platforms use measured frame delivery rather than a RAM/browser guess.
  const armLinux = /Linux/i.test(navigator.userAgent) && /aarch64|armv[78]|arm64/i.test(navigator.userAgent)
  governor.level = quality === 'low' ? 2 : quality === 'balanced' || armLinux ? 1 : 0
  publishBudget()
  document.addEventListener('visibilitychange', () => {
    resetFrameTiming()
    if (document.visibilityState === 'hidden') {
      if (nativeFrame) window.cancelAnimationFrame(nativeFrame)
      nativeFrame = 0
    } else {
      schedule()
    }
  })
}

// CSS geometry and terrain simulation always stay in logical pixels.
export function canvasPixelRatio(width: number, height: number, preferred: number) {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const profile = PROFILES[governor.level]
  const pixelBudget = Math.min(
    memory !== undefined && memory <= 4 ? 2_000_000 : 4_000_000,
    profile.pixels,
    profile.totalPixels / Math.max(1, surfaces.size),
  )
  return Math.min(window.devicePixelRatio || 1, preferred, Math.sqrt(pixelBudget / Math.max(1, width * height)))
}

// Change backing stores without resetting particles, weather, water or clocks.
export function createCanvasSurface(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  preferred: number,
  onRasterChange?: () => void,
) {
  initialize()
  let width = window.innerWidth
  let height = window.innerHeight
  let previousRatio = 0
  const surface: Surface = {
    resize() {
      const ratio = canvasPixelRatio(width, height, preferred)
      const pixelsWide = Math.max(1, Math.floor(width * ratio))
      const pixelsHigh = Math.max(1, Math.floor(height * ratio))
      if (canvas.width === pixelsWide && canvas.height === pixelsHigh && previousRatio === ratio) return
      canvas.width = pixelsWide
      canvas.height = pixelsHigh
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      previousRatio = ratio
      onRasterChange?.()
    },
  }
  surfaces.add(surface)
  publishBudget()
  return {
    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth
      height = nextHeight
      surface.resize()
    },
    dispose() {
      surfaces.delete(surface)
      canvas.width = canvas.height = 1
      publishBudget()
    },
  }
}

let nextHandle = 0
let nativeFrame = 0
let dispatching = false
let lastNativeTime = 0
let lastDrawTime = Number.NEGATIVE_INFINITY
let lastWorkMs = 0
const callbacks = new Map<number, FrameRequestCallback>()

function resetFrameTiming() {
  lastNativeTime = 0
  lastDrawTime = Number.NEGATIVE_INFINITY
  lastWorkMs = 0
  governor.resetSamples()
}

function schedule() {
  if (!nativeFrame && !dispatching && callbacks.size && document.visibilityState !== 'hidden') {
    nativeFrame = window.requestAnimationFrame(frame)
  }
}

function frame(time: number) {
  nativeFrame = 0
  if (document.visibilityState === 'hidden') { resetFrameTiming(); return }
  if (lastNativeTime && governor.observe(time - lastNativeTime, lastWorkMs)) publishBudget()
  lastNativeTime = time
  lastWorkMs = 0
  const interval = 1000 / PROFILES[governor.level].fps
  // Tolerance avoids accidentally halving frame rate due to timestamp jitter.
  if (time - lastDrawTime >= interval - 0.75) {
    lastDrawTime = time
    const started = performance.now()
    const handles = [...callbacks.keys()]
    dispatching = true
    for (const handle of handles) {
      const callback = callbacks.get(handle)
      if (!callback) continue // A preceding layer may have cancelled it.
      callbacks.delete(handle)
      try { callback(time) } catch (error) {
        // One broken layer must not strand the other layers' pending callbacks.
        queueMicrotask(() => { throw error })
      }
    }
    dispatching = false
    lastWorkMs = performance.now() - started
  }
  if (!callbacks.size) resetFrameTiming()
  schedule()
}

export function requestSceneFrame(callback: FrameRequestCallback): number {
  initialize()
  const handle = ++nextHandle
  callbacks.set(handle, callback)
  schedule()
  return handle
}

export function cancelSceneFrame(handle: number) {
  callbacks.delete(handle)
  if (!callbacks.size && !dispatching) {
    if (nativeFrame) window.cancelAnimationFrame(nativeFrame)
    nativeFrame = 0
    resetFrameTiming()
  }
}
