// Guardas de ruta: protegidas (requieren sesión) y de invitado (/entrar, /registro).

import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { useSession } from './session'
import { safeRedirect } from '../lib/safeRedirect'
import { SessionChecking, SessionError } from '../components/SessionStates'

function Gate({ children }: { children: ReactNode }) {
  const { state, refresh } = useSession()
  if (state.status === 'checking') return <SessionChecking />
  if (state.status === 'error') return <SessionError error={state.error} onRetry={refresh} />
  return <>{children}</>
}

/** Sin sesión → /entrar?redirectTo=<ruta actual>. */
export function RequireAuth() {
  const { state } = useSession()
  const location = useLocation()
  if (state.status === 'signed-out') {
    const here = `${location.pathname}${location.search}${location.hash}`
    // Tras cerrar sesión no se guarda destino: al volver a entrar se empieza en el inicio.
    const target = state.explicit || here === '/' ? '/entrar' : `/entrar?redirectTo=${encodeURIComponent(here)}`
    return (
      <>
        <SessionChecking />
        <Navigate to={target} replace />
      </>
    )
  }
  return (
    <Gate>
      <Outlet />
    </Gate>
  )
}

/** Con sesión → al destino pedido (validado) o al inicio. */
export function GuestOnly() {
  const { state } = useSession()
  const [params] = useSearchParams()
  // <Navigate> no pinta nada hasta redirigir: se muestra el esqueleto para no dejar la pantalla en blanco.
  if (state.status === 'signed-in') {
    return (
      <>
        <SessionChecking />
        <Navigate to={safeRedirect(params.get('redirectTo'))} replace />
      </>
    )
  }
  return (
    <Gate>
      <Outlet />
    </Gate>
  )
}
