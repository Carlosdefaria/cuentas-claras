// Estado de sesión de la app: comprobando, con sesión, sin sesión o error (sin red / servicio caído).
// Se vuelve a comprobar al volver la app a primer plano (PWA en iOS: reabrir la app no recarga la página).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authClient, fetchSession, type SessionUser } from '../lib/auth'

export type SessionState =
  | { status: 'checking' }
  | { status: 'signed-in'; user: SessionUser }
  | { status: 'signed-out'; explicit?: boolean } // explicit: el usuario ha cerrado sesión
  | { status: 'error'; error: unknown }

interface SessionApi {
  state: SessionState
  refresh: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionApi | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'checking' })

  const refresh = useCallback(async () => {
    try {
      const { user } = await fetchSession()
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' })
    } catch (error) {
      setState((prev) => (prev.status === 'signed-in' ? prev : { status: 'error', error }))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const api = useMemo<SessionApi>(
    () => ({
      state,
      refresh,
      // El SDK lanza excepciones en los errores (p. ej. invalid_credentials): se propagan al formulario.
      signIn: async (email, password) => {
        await authClient.signIn.email({ email, password })
        await refresh()
      },
      signUp: async (name, email, password) => {
        await authClient.signUp.email({ name, email, password })
        await refresh()
      },
      signOut: async () => {
        await authClient.signOut()
        setState({ status: 'signed-out', explicit: true })
      },
    }),
    [state, refresh],
  )

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return ctx
}
