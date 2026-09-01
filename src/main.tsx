import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)

if (import.meta.env.DEV) {
  // Belt-and-braces cleanup after the module graph has loaded. index.html clears
  // stale workers/caches before import; this removes anything an already-active
  // old controller recreated while serving that final dev import graph.
  const cleanup = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key.startsWith('this-quiet-world')).map((key) => caches.delete(key)))
    }
  }
  void cleanup().catch(() => {})
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
