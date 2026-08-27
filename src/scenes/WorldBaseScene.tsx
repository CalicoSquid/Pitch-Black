import { useEffect, useRef } from 'react'
import type { Scene } from '../types'
import { ensureWorld, pitchWorld } from '../world/worldState'
import {
  createTerrainRenderCache,
  drawFrozenSkin,
  drawStandingWater,
  drawTerrain,
  invalidateTerrainRenderCache,
} from '../world/worldRendering'

export function WorldBaseScene({ scene }: { scene: Scene }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef(scene)

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let raf = 0
    let last = performance.now()
    let light = sceneRef.current === 'snow' ? 1 : 0.82
    let idleCleared = false
    const terrainCache = createTerrainRenderCache()

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      invalidateTerrainRenderCache(terrainCache)
      ensureWorld(width, height)
    }

    const targetLight = () => {
      if (sceneRef.current === 'snow') return 1
      if (sceneRef.current === 'rain') return 0.82
      if (sceneRef.current === 'ember') return 0.42
      if (sceneRef.current === 'calm') return 0.58
      return 0
    }

    const draw = (time: number) => {
      const dt = Math.min(40, time - last)
      last = time
      const blend = 1 - Math.exp(-dt / 950)
      light += (targetLight() - light) * blend

      if (light <= 0.008) {
        if (!idleCleared) {
          ctx.clearRect(0, 0, width, height)
          idleCleared = true
        }
        raf = requestAnimationFrame(draw)
        return
      }

      idleCleared = false
      ctx.clearRect(0, 0, width, height)
      drawTerrain(ctx, width, height, light, time, pitchWorld.wetness, terrainCache)
      drawFrozenSkin(ctx, width, height, Math.max(0.20, light))
      drawStandingWater(ctx, width, height, Math.max(0.20, light))

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas className="scene-canvas world-base-canvas" ref={canvasRef} aria-hidden="true" />
}

