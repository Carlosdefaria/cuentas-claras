import { beforeEach, describe, expect, it, vi } from 'vitest'

const handleAuthProxyRequest = vi.fn()
vi.mock('@neon/auth/server', () => ({ handleAuthProxyRequest }))

const { authProxy, authPathFromUrl } = await import('./authProxy.ts')

const ENV = {
  NEON_AUTH_BASE_URL: 'https://ep-test.neonauth.example.neon.tech/neondb/auth',
  NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32),
}

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://app.example${path}`, init)
}

beforeEach(() => {
  handleAuthProxyRequest.mockReset()
  handleAuthProxyRequest.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
})

describe('authPathFromUrl', () => {
  it.each([
    ['/api/auth/get-session', 'get-session'],
    ['/api/auth/sign-in/email', 'sign-in/email'],
    ['/api/auth/email-otp/verify-email', 'email-otp/verify-email'],
    ['/api/auth?__path=sign-up/email', 'sign-up/email'], // tras el rewrite de vercel.json
  ])('%s → %s', (url, expected) => {
    expect(authPathFromUrl(new URL(`https://app.example${url}`))).toBe(expected)
  })

  it.each([
    '/api/auth/',
    '/api/auth',
    '/api/auth/../secret',
    '/api/auth/a/../../x',
    '/api/auth/%2e%2e/x',
    '/api/auth//evil.com',
    '/api/auth/a//b',
    '/api/auth/a b',
    '/api/auth/a%2Fb',
    '/api/auth?__path=../x',
    '/api/auth?__path=https://evil.com',
    '/api/otra/cosa',
  ])('rechaza %s', (url) => {
    expect(authPathFromUrl(new URL(`https://app.example${url}`))).toBeNull()
  })
})

describe('authProxy', () => {
  it('reenvía al proxy oficial con el destino fijo de la variable de entorno', async () => {
    const res = await authProxy(req('/api/auth/sign-in/email', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json', origin: 'https://app.example' } }), ENV)
    expect(res.status).toBe(200)
    expect(handleAuthProxyRequest).toHaveBeenCalledOnce()
    const cfg = handleAuthProxyRequest.mock.calls[0][0]
    expect(cfg.baseUrl).toBe(ENV.NEON_AUTH_BASE_URL)
    expect(cfg.path).toBe('sign-in/email')
    expect(cfg.cookieSecret).toBe(ENV.NEON_AUTH_COOKIE_SECRET)
    expect(cfg.sameSite).toBe('lax')
    expect(await cfg.request.text()).toBe('{"a":1}')
  })

  it('no reenvía el parámetro interno __path al servidor de Auth', async () => {
    await authProxy(req('/api/auth?__path=verify-email&token=abc'), ENV)
    const url = new URL(handleAuthProxyRequest.mock.calls[0][0].request.url)
    expect(url.searchParams.has('__path')).toBe(false)
    expect(url.searchParams.get('token')).toBe('abc')
  })

  it('en get-session desactiva la caché de sesión del SDK (si no, la respuesta llega sin JWT)', async () => {
    await authProxy(req('/api/auth/get-session'), ENV)
    const url = new URL(handleAuthProxyRequest.mock.calls[0][0].request.url)
    expect(url.searchParams.get('disableCookieCache')).toBe('true')
  })

  it('no toca la query de otras rutas', async () => {
    await authProxy(req('/api/auth/token'), ENV)
    const url = new URL(handleAuthProxyRequest.mock.calls[0][0].request.url)
    expect(url.searchParams.has('disableCookieCache')).toBe(false)
  })

  it('marca todas las respuestas como no cacheables', async () => {
    const res = await authProxy(req('/api/auth/get-session'), ENV)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('quita content-encoding (el cuerpo ya llega descomprimido) y conserva las cookies', async () => {
    const upstream = new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } })
    upstream.headers.append('set-cookie', 'a=1; Path=/; Secure; HttpOnly')
    upstream.headers.append('set-cookie', 'b=2; Path=/; Secure; HttpOnly')
    handleAuthProxyRequest.mockResolvedValue(upstream)
    const res = await authProxy(req('/api/auth/get-session'), ENV)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.getSetCookie()).toHaveLength(2)
    expect(await res.json()).toEqual({ ok: true })
  })

  it.each(['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'])('rechaza el método %s con 405', async (method) => {
    const res = await authProxy(req('/api/auth/get-session', { method }), ENV)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, POST')
    expect(handleAuthProxyRequest).not.toHaveBeenCalled()
  })

  it('rechaza rutas fuera de /api/auth/* con 404 sin llamar al servidor de Auth', async () => {
    const res = await authProxy(req('/api/auth/../../etc'), ENV)
    expect(res.status).toBe(404)
    expect(handleAuthProxyRequest).not.toHaveBeenCalled()
  })

  it('rechaza cuerpos de más de 64 KB con 413', async () => {
    const res = await authProxy(req('/api/auth/sign-up/email', { method: 'POST', body: 'x'.repeat(64 * 1024 + 1) }), ENV)
    expect(res.status).toBe(413)
    expect(handleAuthProxyRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['sin URL de Auth', { ...ENV, NEON_AUTH_BASE_URL: undefined }],
    ['URL no HTTPS', { ...ENV, NEON_AUTH_BASE_URL: 'http://ep-test.neonauth.example/neondb/auth' }],
    ['URL no válida', { ...ENV, NEON_AUTH_BASE_URL: 'no-es-una-url' }],
    ['secreto corto', { ...ENV, NEON_AUTH_COOKIE_SECRET: 'corto' }],
    ['sin secreto', { ...ENV, NEON_AUTH_COOKIE_SECRET: undefined }],
  ])('responde 500 si la configuración es inválida (%s) sin llamar al servidor de Auth', async (_n, env) => {
    const res = await authProxy(req('/api/auth/get-session'), env)
    expect(res.status).toBe(500)
    expect(handleAuthProxyRequest).not.toHaveBeenCalled()
  })
})
