import react from '@vitejs/plugin-react'
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
  },
})
