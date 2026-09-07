import { useEffect, useRef } from 'react'
import { SunriseControls } from './SunriseControls'
import type { useSunriseAlarm } from './useSunriseAlarm'

type Controller = ReturnType<typeof useSunriseAlarm>

export function SunriseDialog({ open, onClose, sunrise, sleepTimerActive }: {
  open: boolean; onClose: () => void; sunrise: Controller; sleepTimerActive: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return <dialog ref={ref} className="sunrise-dialog" aria-labelledby="sunrise-dialog-title"
    onCancel={onClose} onClose={onClose}>
    <header className="sunrise-dialog-header">
      <div><p>A LITTLE MORNING</p><h2 id="sunrise-dialog-title">Wake with the world</h2></div>
      <button type="button" autoFocus onClick={onClose} aria-label="Close sunrise setup">Close</button>
    </header>
    <SunriseControls sunrise={{ ...sunrise, preview: async () => {
      const started = await sunrise.preview()
      if (started) onClose()
      return started
    } }} sleepTimerActive={sleepTimerActive} />
  </dialog>
}

export function SunriseWakeActions({ sunrise, onManage }: { sunrise: Controller; onManage: () => void }) {
  // The live alarm no longer opens a second floating card: App swaps the bedside
  // control dock for Snooze / Finish instead. Keep this lightweight surface only
  // for the accelerated preview, where an explicit way back is still useful.
  if (!sunrise.previewActive) return null
  return <div className="sunrise-wake-actions" role="region" aria-label="Sunrise preview">
    <p>{sunrise.previewExiting ? 'Returning to night' : 'A glimpse of morning'}</p>
    {!sunrise.previewExiting && <button type="button" onClick={sunrise.stopPreview}>End preview</button>}
    <button type="button" onClick={onManage}>Sunrise settings</button>
  </div>
}
