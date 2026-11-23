// Hoja inferior «¿Cómo se reparte?» (variante B): tres opciones explicadas en una línea. Elegir cierra la hoja al
// momento (sin botón de confirmar): cambiar de reparto cuesta un toque. Mismo <dialog> que «Invitar».

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { es } from '../../i18n/es'
import type { SplitType } from '../../domain/expenseForm'

const T = es.expenses.split
const OPTIONS: SplitType[] = ['equal', 'amounts', 'percent']

export function SplitTypeSheet({ open, value, onChoose, onClose }: { open: boolean; value: SplitType; onChoose: (type: SplitType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const name = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // El foco, en la opción elegida (con las flechas se cambia, como en cualquier grupo de opciones).
      dialog.querySelector<HTMLInputElement>('input:checked')?.focus({ focusVisible: false } as FocusOptions)
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="hoja-inferior m-0 mt-auto w-full max-w-none bg-transparent p-0 text-tinta"
    >
      {/* El contenido solo existe con la hoja abierta (no deja radios ocultos en la página). */}
      {open && (
      <div className="mx-auto max-w-md rounded-t-2xl bg-hoja px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2">
        <div className="relative flex h-11 items-center justify-center">
          <span aria-hidden className="h-1.25 w-10 rounded-full bg-trazo" />
          <button
            type="button"
            onClick={onClose}
            aria-label={T.close}
            className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-lg text-tinta-suave hover:bg-papel hover:text-tinta"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <h2 id={titleId} className="font-rotulo text-[1.5rem] font-bold uppercase leading-[1.05] tracking-[0.01em]">
          {T.title}
        </h2>
        <div role="radiogroup" aria-labelledby={titleId} className="mt-2 divide-y divide-papel-hondo">
          {OPTIONS.map((type) => (
            <label key={type} className="flex min-h-16 cursor-pointer items-center gap-3 py-2.5">
              <input
                type="radio"
                name={name}
                value={type}
                checked={value === type}
                // onClick (y no solo onChange): tocar la opción ya elegida también cierra la hoja.
                onChange={() => onChoose(type)}
                onClick={() => value === type && onClose()}
                className="size-5.5 flex-none cursor-pointer accent-loteria"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{T.options[type].title}</span>
                <span className="block text-[0.8125rem] text-tinta-suave">{T.options[type].body}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      )}
    </dialog>
  )
}
