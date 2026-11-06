import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A native modal `<dialog>` that follows `open`: the browser traps focus,
 * makes the page inert, closes on Esc and returns focus to what opened it.
 * Its children are mounted only while open, so their state starts fresh.
 */
export function ModalDialog({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean
  onClose(): void
  labelledBy: string
  className: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current!
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={labelledBy}
      // Esc closes it natively; this keeps the owner's state in step.
      onClose={onClose}
      // The body fills the dialog, so a click on the dialog itself is the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open && children}
    </dialog>
  )
}
