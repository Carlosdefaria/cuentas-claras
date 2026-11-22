// Avisos bajo la barra superior: sin conexión y versión nueva disponible.

import { useState } from 'react'
import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react'
import { es } from '../i18n/es'
import { applyUpdate, useOnline, useUpdateReady } from './updates'

const T = es.pwa

export function PwaBanners() {
  const online = useOnline()
  const updateReady = useUpdateReady()
  const [updating, setUpdating] = useState(false)

  return (
    <div aria-live="polite">
      {!online && (
        <div className="border-b border-trazo bg-papel-hondo">
          <p className="mx-auto flex min-h-11 max-w-md items-center gap-2.5 px-4 py-2 text-[0.9375rem] text-tinta">
            <WifiOff aria-hidden className="size-5 shrink-0 text-tinta-suave" strokeWidth={2} />
            <span>
              <strong className="font-semibold">{T.offlineTitle}</strong> {T.offlineBody}
            </span>
          </p>
        </div>
      )}
      {online && updateReady && (
        <div className="border-b border-loteria/20 bg-loteria-claro">
          <div className="mx-auto flex max-w-md items-center gap-3 py-1.5 pl-4 pr-2">
            <RefreshCw aria-hidden className="size-5 shrink-0 text-loteria" strokeWidth={2} />
            <p className="flex-1 text-[0.9375rem] font-medium text-tinta">{T.updateReady}</p>
            <button
              type="button"
              disabled={updating}
              aria-busy={updating || undefined}
              onClick={() => {
                setUpdating(true)
                void applyUpdate()
              }}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-loteria px-4 text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-loteria-hondo active:bg-loteria-hondo disabled:opacity-60"
            >
              {updating && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              {updating ? T.updating : T.update}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
