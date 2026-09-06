import { useEffect, useRef, useState } from 'react'

const TIMER_OPTIONS = [30, 60, 120, 240] as const

function optionLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000))
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} left`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'} left`
  return `${hours}h ${minutes}m left`
}

function formatEnd(timestamp: number) {
  const end = new Date(timestamp)
  const now = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(end)
  if (end.toDateString() === now.toDateString()) return `Today, ${time}`
  if (end.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(end)
  return `${date}, ${time}`
}

export function SleepTimerDialog({
  open,
  onClose,
  active,
  endAt,
  selectedMinutes,
  remainingMs,
  onSet,
  onCancel,
}: {
  open: boolean
  onClose: () => void
  active: boolean
  endAt: number | null
  selectedMinutes: number | null
  remainingMs: number
  onSet: (minutes: number) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [choice, setChoice] = useState<number>(selectedMinutes ?? 60)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (open) setChoice(selectedMinutes ?? 60)
  }, [open, selectedMinutes])

  const apply = () => {
    onSet(choice)
    onClose()
  }

  const cancelTimer = () => {
    onCancel()
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="sunrise-dialog sleep-timer-dialog"
      aria-labelledby="sleep-timer-dialog-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <header className="sunrise-dialog-header">
        <div>
          <p>A QUIET END</p>
          <h2 id="sleep-timer-dialog-title">Sleep timer</h2>
        </div>
        <button type="button" autoFocus onClick={onClose} aria-label="Close sleep timer">Close</button>
      </header>

      <div className="sleep-timer-dialog-body">
        {active && endAt !== null && (
          <div className="sunrise-confirmation sleep-timer-running" aria-live="polite">
            <strong>{formatRemaining(remainingMs)}</strong>
            <span>Nighttime sound will be silent by {formatEnd(endAt)}.</span>
          </div>
        )}

        <fieldset className="sunrise-fieldset">
          <legend>{active ? 'Change length' : 'Timer length'}</legend>
          <div className="sunrise-choice-row sleep-timer-choice-row">
            {TIMER_OPTIONS.map((minutes) => (
              <button
                type="button"
                key={minutes}
                className={choice === minutes ? 'active' : ''}
                aria-pressed={choice === minutes}
                onClick={() => setChoice(minutes)}
              >
                {optionLabel(minutes)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="sleep-timer-explanation">
          <p>TQW fades nighttime ambience during the final minute, then mutes it.</p>
          <p>The sunrise alarm has its own wake sound, so an armed audible wake-up is unaffected.</p>
        </div>

        <button type="button" className="sunrise-arm sleep-timer-primary" onClick={apply}>
          {active ? 'Update timer' : 'Start timer'}
        </button>

        {active && (
          <div className="sunrise-active-actions sleep-timer-actions">
            <button type="button" onClick={cancelTimer}>Cancel timer</button>
          </div>
        )}
      </div>
    </dialog>
  )
}
