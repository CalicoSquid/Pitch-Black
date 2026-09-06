import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep the normal modern ESM path, but transpile syntax far enough back for
  // older module-capable TV/projector browsers. Truly pre-module browsers are
  // handled by the tiny boot fallback in index.html instead of receiving a
  // second application bundle that could drift from production behavior.
  build: {
    target: 'es2017',
    // TQW is mostly a single-screen app, but its discovery pages are intentionally
    // real, crawlable HTML rather than SPA routes. Declaring every static entry keeps
    // them readable without JavaScript in Vite dev and in the production build.
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        about: resolve(process.cwd(), 'about/index.html'),
        rainSounds: resolve(process.cwd(), 'rain-sounds/index.html'),
        bedsideClock: resolve(process.cwd(), 'bedside-clock/index.html'),
      },
    },
  },
})
