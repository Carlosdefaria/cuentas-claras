// Hoja inferior «Invitar»: hoja nativa de compartir (navigator.share, iOS) y «Copiar enlace» de respaldo.
// Es un <dialog> modal: foco atrapado, Escape y toque fuera para cerrar, y el foco vuelve al botón que la abrió.

import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Share, X } from 'lucide-react'
import { es } from '../../i18n/es'
import { Button, Participacion } from '../../components/ui'
import { canShareUrl } from '../../lib/share'

const T = es.groups.invite

type CopyState = 'idle' | 'copied' | 'failed'

export function InviteSheet({ open, onClose, groupName, url }: { open: boolean; onClose: () => void; groupName: string; url: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const linkRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [copy, setCopy] = useState<CopyState>('idle')
  const shareable = canShareUrl(url)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setCopy('idle')
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  async function share() {
    try {
      await navigator.share({ title: T.shareTitle(groupName), text: T.shareText(groupName), url })
    } catch (error) {
      // Cancelar la hoja nativa no es un error. Si no se puede compartir, se copia.
      if ((error as { name?: string } | null)?.name !== 'AbortError') await copyLink()
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopy('copied')
    } catch {
      // Sin API de portapapeles: se selecciona el enlace para copiarlo a mano.
      linkRef.current?.focus()
      linkRef.current?.select()
      setCopy('failed')
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose() // toque en el fondo
      }}
      className="hoja-inferior m-0 mt-auto w-full max-w-none bg-transparent p-0 text-tinta"
    >
      <div className="mx-auto max-w-md rounded-t-2xl bg-hoja px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 [--troquel-fondo:var(--color-hoja)]">
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
        <Participacion title={<span id={titleId}>{T.title(groupName)}</span>} tint="menta" level={2} compact>
          <p className="text-[0.9375rem] text-tinta-suave">{T.body}</p>
          <label className="mt-3 block">
            <span className="sr-only">{T.linkLabel}</span>
            <input
              ref={linkRef}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 w-full truncate rounded-lg border border-trazo bg-white px-3 text-[1rem] text-tinta-suave focus:border-loteria focus:outline-none focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]"
            />
          </label>
        </Participacion>
        <div className="mt-4 flex flex-col gap-2.5">
          {shareable && (
            // El foco inicial del diálogo va a la acción principal, no a la ✕.
            <Button autoFocus onClick={() => void share()}>
              <Share aria-hidden className="size-5" />
              {T.share}
            </Button>
          )}
          <button
            type="button"
            autoFocus={!shareable}
            onClick={() => void copyLink()}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold transition-colors duration-150 ${
              shareable ? 'border border-trazo bg-white text-loteria hover:bg-papel' : 'bg-loteria text-white hover:bg-loteria-hondo'
            }`}
          >
            {copy === 'copied' ? <Check aria-hidden className="size-5" strokeWidth={2.5} /> : <Copy aria-hidden className="size-5" />}
            {T.copy}
          </button>
          <p aria-live="polite" className={`min-h-5 text-center text-sm font-medium ${copy === 'failed' ? 'text-tinta-suave' : 'text-favor'}`}>
            {copy === 'copied' ? T.copied : copy === 'failed' ? T.copyFailed : ''}
          </p>
        </div>
      </div>
    </dialog>
  )
}
