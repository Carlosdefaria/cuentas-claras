// Estados de la comprobación de sesión: cargando (esqueleto) y error con reintento.

import { useState } from 'react'
import { WifiOff } from 'lucide-react'
import { es } from '../i18n/es'
import { authErrorMessage } from '../lib/authErrors'
import { Button, TopBar } from './ui'

export function SessionChecking() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-8" aria-busy="true">
        <p className="sr-only" role="status">
          {es.auth.session.checking}
        </p>
        <div aria-hidden className="animate-pulse rounded-xl bg-hoja">
          <div className="h-20 rounded-t-xl bg-papel-hondo" />
          <div className="space-y-4 p-5">
            <div className="h-12 rounded-lg bg-papel" />
            <div className="h-12 rounded-lg bg-papel" />
            <div className="h-12 rounded-lg bg-loteria-claro" />
          </div>
        </div>
      </main>
    </div>
  )
}

export function SessionError({ error, onRetry }: { error: unknown; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false)
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pt-16 text-center">
        <WifiOff aria-hidden className="size-10 text-tinta-suave" strokeWidth={1.75} />
        <h1 className="mt-4 text-xl font-semibold text-tinta">{es.auth.session.errorTitle}</h1>
        <p className="mt-2 text-tinta-suave">{authErrorMessage(error)}</p>
        <div className="mt-8 w-full">
          <Button
            loading={retrying}
            onClick={async () => {
              setRetrying(true)
              try {
                await onRetry()
              } finally {
                setRetrying(false)
              }
            }}
          >
            {es.common.retry}
          </Button>
        </div>
      </main>
    </div>
  )
}
