// Bound each full-screen backing store, including on 4K TVs/projectors.
// CSS geometry stays in logical pixels; only raster density changes.
export function canvasPixelRatio(width: number, height: number, preferred: number) {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const pixelBudget = memory !== undefined && memory <= 4 ? 2_000_000 : 4_000_000
  return Math.min(window.devicePixelRatio || 1, preferred, Math.sqrt(pixelBudget / Math.max(1, width * height)))
}
