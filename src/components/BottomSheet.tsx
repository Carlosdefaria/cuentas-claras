// Hoja inferior (<dialog> modal) como «Invitar» o «¿Borrar este gasto?»: asa, ✕ de 44 px, foco atrapado, Escape y toque
// fuera para cerrar (salvo mientras `busy`). `initialFocus` recibe el foco al abrir (p. ej. «Cancelar», nunca la acción
// destructiva).

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'

export function BottomSheet({
  open,
  onClose,
  labelledBy,
  describedBy,
  closeLabel,
  busy = false,
  initialFocus,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  describedBy?: string
  closeLabel: string
  busy?: boolean
  initialFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      initialFocus?.current?.focus({ focusVisible: false } as FocusOptions)
    } else if (!open && dialog.open) dialog.close()
  }, [open, initialFocus])

  const close = () => {
    if (!busy) onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault() // Escape: se cierra por el mismo camino (y no mientras `busy`)
        close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close() // toque en el fondo
      }}
      className="hoja-inferior m-0 mt-auto w-full max-w-none bg-transparent p-0 text-tinta"
    >
      <div className="mx-auto max-w-md rounded-t-2xl bg-hoja px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
        <div className="relative flex h-11 items-center justify-center">
          <span aria-hidden className="h-1.25 w-10 rounded-full bg-trazo" />
          <button
            type="button"
            onClick={close}
            aria-label={closeLabel}
            disabled={busy}
            className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-lg text-tinta-suave hover:bg-papel hover:text-tinta disabled:opacity-60"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  )
}

/** Botón secundario de una hoja («Cancelar», «Cerrar»). */
export function SheetSecondaryButton({
  buttonRef,
  onClick,
  disabled,
  children,
}: {
  buttonRef?: RefObject<HTMLButtonElement | null>
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-trazo bg-white px-4 text-base font-semibold text-loteria transition-colors duration-150 hover:bg-papel active:bg-papel-hondo disabled:opacity-60"
    >
      {children}
    </button>
  )
}
