// Hoja inferior de confirmación de borrado («¿Borrar este gasto?», «¿Borrar este pago?»): qué se borra, qué pasa con
// los saldos y la confirmación.
// Mismo <dialog> modal que «Invitar»: foco atrapado, Escape y toque fuera para cerrar (salvo mientras se borra).
// El foco inicial va a «Cancelar», no a la acción destructiva.

import { useEffect, useId, useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import { es } from '../../i18n/es'
import { formatCents } from '../../domain/money'
import { Alert, Button } from '../../components/ui'

const T = es.expenses.remove

export function ConfirmDeleteSheet({
  open,
  onClose,
  onConfirm,
  description,
  amountCents,
  deleting,
  error,
  text = T,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  description: string
  amountCents: number
  deleting: boolean
  error: string | null
  /** Textos de la hoja (por defecto, los de borrar un gasto). */
  text?: { title: string; body: string; confirm: string }
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      cancelRef.current?.focus({ focusVisible: false } as FocusOptions)
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  const close = () => {
    if (!deleting) onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault() // Escape: se cierra por el mismo camino (y no mientras se borra)
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
            aria-label={T.close}
            disabled={deleting}
            className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-lg text-tinta-suave hover:bg-papel hover:text-tinta disabled:opacity-60"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <h2 id={titleId} className="font-rotulo text-[1.5rem] font-bold uppercase leading-[1.05] tracking-[0.01em]">
          {text.title}
        </h2>
        <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-white px-3.5 py-3 shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
          <span className="min-w-0 break-words font-semibold">{description}</span>
          <span className="flex-none font-bold tabular-nums">{formatCents(amountCents)}</span>
        </div>
        <p id={bodyId} className="mt-3 text-tinta-suave">
          {text.body}
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          {error && <Alert>{error}</Alert>}
          <Button tone="destructivo" loading={deleting} onClick={onConfirm}>
            {!deleting && <Trash2 aria-hidden className="size-5" />}
            {deleting ? T.deleting : text.confirm}
          </Button>
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={deleting}
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-trazo bg-white px-4 text-base font-semibold text-loteria transition-colors duration-150 hover:bg-papel active:bg-papel-hondo disabled:opacity-60"
          >
            {T.cancel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
