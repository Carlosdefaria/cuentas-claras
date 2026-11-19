// Cliente de Neon Auth. Siempre habla con nuestro propio dominio (/api/auth/*, proxy same-origin),
// así la cookie de sesión es first-party también en Safari y en la PWA de iOS.

import { createAuthClient } from '@neon/auth'

export const authClient = createAuthClient(`${window.location.origin}/api/auth`)

export interface SessionUser {
  id: string
  name: string
  email: string
}

export interface SessionSnapshot {
  user: SessionUser | null
  /** JWT para la Data API (Authorization: Bearer). Solo si es un JWT, no el token opaco de sesión. */
  jwt: string | null
}

export async function fetchSession(): Promise<SessionSnapshot> {
  const { data } = await authClient.getSession()
  const user = data?.user ? { id: data.user.id, name: data.user.name, email: data.user.email } : null
  const token = (data?.session as { token?: string } | undefined)?.token
  return { user, jwt: user && token && token.split('.').length === 3 ? token : null }
}
