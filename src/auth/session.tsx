// Estado de sesión de la app: comprobando, con sesión, sin sesión o error (sin red / servicio caído).
// Se vuelve a comprobar al volver la app a primer plano (PWA en iOS: reabrir la app no recarga la página).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authClient, fetchSession, type SessionUser } from '../lib/auth'
import { verifyEmail as verifyEmailCode } from '../lib/otp'
import { sessionJwt } from '../lib/data'

export type SessionState =
  | { status: 'checking' }
  | { status: 'signed-in'; user: SessionUser }
  | { status: 'signed-out'; explicit?: boolean } // explicit: el usuario ha cerrado sesión
  | { status: 'error'; error: unknown }

interface SessionApi {
  state: SessionState
  refresh: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  /** 'verify' si la cuenta queda pendiente de confirmar el email (el servidor ha enviado el código). */
  signUp: (name: string, email: string, password: string) => Promise<'signed-in' | 'verify'>
  /** Confirma el email con el código; el servidor abre la sesión. */
  verifyEmail: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionApi | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'checking' })
  const userIdRef = useRef<string | null>(null)

  const load = useCallback(async (): Promise<SessionUser | null> => {
    const { user } = await fetchSession()
    // El JWT de la Data API vive solo en memoria: se olvida si no hay sesión o cambia el usuario.
    if (!user || (userIdRef.current && userIdRef.current !== user.id)) sessionJwt.clear()
    userIdRef.current = user?.id ?? null
    setState(user ? { status: 'signed-in', user } : { status: 'signed-out' })
    return user
  }, [])

  const refresh = useCallback(async () => {
    try {
      await load()
    } catch (error) {
      setState((prev) => (prev.status === 'signed-in' ? prev : { status: 'error', error }))
    }
  }, [load])

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
        // Con verificación obligatoria el registro no abre sesión: toca escribir el código.
        return (await load()) ? 'signed-in' : 'verify'
      },
      verifyEmail: async (email, code) => {
        await verifyEmailCode(email, code)
        await refresh()
      },
      signOut: async () => {
        await authClient.signOut()
        sessionJwt.clear()
        setState({ status: 'signed-out', explicit: true })
      },
    }),
    [state, refresh, load],
  )

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return ctx
}
