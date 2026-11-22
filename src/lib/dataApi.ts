// Cliente mínimo de la Data API de Neon (PostgREST) con el JWT de Neon Auth.
//
// - El JWT sale de getSession() (session.token) y se guarda SOLO en memoria hasta poco antes de caducar.
// - Si la Data API responde 401, se pide un JWT nuevo y se reintenta una vez.
// - Nada se cachea: el service worker trata este origen como solo red y aquí no hay caché de respuestas.
// - Los errores se convierten en DataApiError con un `kind` que la UI traduce (nunca el mensaje del servidor).

export type DataErrorKind = 'network' | 'auth' | 'not-found' | 'forbidden' | 'invalid' | 'unavailable' | 'unknown'

export class DataApiError extends Error {
  readonly kind: DataErrorKind
  readonly status: number | undefined
  readonly code: string | undefined
  constructor(kind: DataErrorKind, status?: number, code?: string, message?: string) {
    super(message ?? kind)
    this.name = 'DataApiError'
    this.kind = kind
    this.status = status
    this.code = code
  }
}

/** Códigos de Postgres (errcode de las RPC) y de PostgREST → tipo de error. */
export function kindFor(status: number, code: string | undefined): DataErrorKind {
  switch (code) {
    case '28000': // No autenticado (RPC)
      return 'auth'
    case 'P0002': // No encontrado (p. ej. código de invitación no válido)
      return 'not-found'
    case '42501': // permiso denegado / no eres miembro
      return 'forbidden'
    case '22023': // parámetro no válido (RPC)
    case '23514': // check constraint
    case '22P02': // sintaxis no válida (p. ej. uuid mal formado)
      return 'invalid'
  }
  if (code?.startsWith('PGRST30')) return 'auth' // JWT ausente, caducado o no válido
  if (status === 401) return 'auth'
  if (status === 404) return 'not-found'
  if (status === 403) return 'forbidden'
  if (status === 400) return 'invalid'
  if (status === 429 || status >= 500) return 'unavailable'
  return 'unknown'
}

/** Segundos de margen antes de `exp` para pedir un JWT nuevo. */
const EXPIRY_MARGIN_S = 60

/** `exp` (segundos) del payload de un JWT, o null si no se puede leer. */
export function jwtExpiry(jwt: string): number | null {
  try {
    const part = jwt.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

export interface JwtSource {
  /** JWT vigente; con `force`, uno recién pedido. null si no hay sesión. */
  get(force?: boolean): Promise<string | null>
  /** Olvida el JWT (al cerrar sesión o cambiar de usuario). */
  clear(): void
}

export function createJwtSource(fetchJwt: () => Promise<string | null>, now: () => number = Date.now): JwtSource {
  let cached: { jwt: string; exp: number | null } | null = null
  let inflight: Promise<string | null> | null = null

  const fresh = () => {
    if (!cached) return false
    if (cached.exp === null) return true
    return cached.exp - EXPIRY_MARGIN_S > now() / 1000
  }

  return {
    async get(force = false) {
      if (!force && fresh()) return cached!.jwt
      // Varias pantallas a la vez comparten una sola petición de sesión.
      inflight ??= fetchJwt()
        .then((jwt) => {
          cached = jwt ? { jwt, exp: jwtExpiry(jwt) } : null
          return jwt
        })
        .finally(() => {
          inflight = null
        })
      return inflight
    },
    clear() {
      cached = null
    },
  }
}

export interface DataApi {
  /** GET de una tabla o vista: `path` incluye la consulta de PostgREST (p. ej. `groups?select=id`). */
  select<T>(path: string): Promise<T>
  /** POST /rpc/<fn> con argumentos con nombre. */
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>
}

export function createDataApi({
  baseUrl,
  jwt,
  fetchImpl = (...a) => fetch(...a),
}: {
  baseUrl: string
  jwt: JwtSource
  fetchImpl?: typeof fetch
}): DataApi {
  const root = baseUrl.replace(/\/+$/, '')

  async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    try {
      return await fetchImpl(`${root}/${path}`, { ...init, headers, cache: 'no-store', credentials: 'omit' })
    } catch {
      throw new DataApiError('network')
    }
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    let token = await jwt.get()
    if (!token) throw new DataApiError('auth', 401)
    let res = await send(path, init, token)
    if (res.status === 401) {
      // JWT caducado o rechazado: uno nuevo y un único reintento.
      token = await jwt.get(true)
      if (!token) throw new DataApiError('auth', 401)
      res = await send(path, init, token)
    }
    const text = await res.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = null
      }
    }
    if (!res.ok) {
      const { code, message } = (body ?? {}) as { code?: string; message?: string }
      throw new DataApiError(kindFor(res.status, code), res.status, code, message)
    }
    return body as T
  }

  return {
    select: (path) => request(path, { method: 'GET' }),
    rpc: (fn, args = {}) =>
      request(`rpc/${encodeURIComponent(fn)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      }),
  }
}
