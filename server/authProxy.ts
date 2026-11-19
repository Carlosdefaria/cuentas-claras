// Proxy same-origin de Neon Auth: el navegador solo habla con /api/auth/* de nuestro dominio
// y la cookie de sesión es first-party (necesario en Safari/iOS, que bloquea las de terceros).
//
// Se apoya en el proxy oficial del SDK (handleAuthProxyRequest de @neon/auth/server), que
// reescribe las cookies (quita Partitioned, fuerza Secure, aplica SameSite, sin Domain) y
// firma una cookie de caché de sesión. Esta capa añade lo que el SDK no limita:
//   - destino FIJO por variable de entorno (NEON_AUTH_BASE_URL); nunca viene de la petición,
//   - solo rutas /api/auth/<segmentos seguros> (sin "..", "//", espacios ni barras codificadas),
//   - solo GET y POST, cuerpo ≤ 64 KB,
//   - Cache-Control: no-store en todas las respuestas.
//
// Lo usan la función de Vercel (api/auth.ts) y el servidor de desarrollo de Vite.

import { handleAuthProxyRequest } from '@neon/auth/server'

export interface AuthProxyEnv {
  NEON_AUTH_BASE_URL?: string
  NEON_AUTH_COOKIE_SECRET?: string
}

const PREFIX = '/api/auth/'
const MAX_BODY_BYTES = 64 * 1024
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/ // no puede empezar por "." (evita "." y "..")

/** Extrae la ruta de Auth ("sign-in/email") o null si no es una ruta permitida. */
export function authPathFromUrl(url: URL): string | null {
  let raw: string | null
  if (url.pathname === '/api/auth' && url.searchParams.has('__path')) {
    raw = url.searchParams.get('__path') // tras el rewrite de vercel.json
  } else if (url.pathname.startsWith(PREFIX)) {
    raw = url.pathname.slice(PREFIX.length)
  } else {
    return null
  }
  if (!raw) return null
  const segments = raw.split('/')
  return segments.every((s) => SEGMENT.test(s)) ? raw : null
}

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })
}

function validBaseUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? value.replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

export async function authProxy(request: Request, env: AuthProxyEnv): Promise<Response> {
  const baseUrl = validBaseUrl(env.NEON_AUTH_BASE_URL)
  const cookieSecret = env.NEON_AUTH_COOKIE_SECRET
  if (!baseUrl || !cookieSecret || cookieSecret.length < 32) {
    console.error('[auth-proxy] Configuración inválida: revisa NEON_AUTH_BASE_URL y NEON_AUTH_COOKIE_SECRET')
    return json(500, { error: 'Auth no configurado' })
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(405, { error: 'Método no permitido' }, { allow: 'GET, POST' })
  }

  const url = new URL(request.url)
  const path = authPathFromUrl(url)
  if (!path) return json(404, { error: 'No encontrado' })

  let body: string | undefined
  if (request.method === 'POST') {
    const declared = Number(request.headers.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES) return json(413, { error: 'Petición demasiado grande' })
    body = await request.text()
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return json(413, { error: 'Petición demasiado grande' })
    }
  }

  // URL limpia (sin el parámetro interno __path) y cuerpo ya leído.
  url.searchParams.delete('__path')
  url.pathname = PREFIX + path
  // La caché de sesión del proxy del SDK (cookie local.session_data) responde get-session sin la
  // cabecera set-auth-jwt, y entonces el cliente se queda sin JWT para la Data API. Se desactiva
  // con el parámetro oficial: get-session va siempre al servidor de Auth.
  if (path === 'get-session') url.searchParams.set('disableCookieCache', 'true')
  const forwarded = new Request(url, { method: request.method, headers: request.headers, body })

  const response = await handleAuthProxyRequest({
    request: forwarded,
    path,
    baseUrl,
    cookieSecret,
    sameSite: 'lax',
  })
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  // fetch (undici) ya descomprime el cuerpo: reenviar content-encoding haría que el navegador
  // intentase descomprimirlo otra vez. El runtime calcula la longitud.
  headers.delete('content-encoding')
  headers.delete('content-length')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
