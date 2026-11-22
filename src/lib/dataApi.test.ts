import { describe, expect, it, vi } from 'vitest'
import { createDataApi, createJwtSource, DataApiError, jwtExpiry, kindFor } from './dataApi'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const jwtWithExp = (exp: number) => `${b64({ alg: 'EdDSA' })}.${b64({ sub: 'u', exp })}.firma`

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('jwtExpiry', () => {
  it('lee exp del payload (base64url)', () => {
    expect(jwtExpiry(jwtWithExp(1_900_000_000))).toBe(1_900_000_000)
  })
  it('null si no se puede leer', () => {
    expect(jwtExpiry('no-es-un-jwt')).toBeNull()
    expect(jwtExpiry(`a.${b64({ sub: 'x' })}.c`)).toBeNull()
  })
})

describe('createJwtSource', () => {
  it('reutiliza el JWT mientras le quede más de un minuto', async () => {
    let now = 1_000_000_000_000
    const fetchJwt = vi.fn(async () => jwtWithExp(now / 1000 + 600))
    const src = createJwtSource(fetchJwt, () => now)
    await src.get()
    await src.get()
    expect(fetchJwt).toHaveBeenCalledTimes(1)
    now += 541_000 // quedan 59 s
    await src.get()
    expect(fetchJwt).toHaveBeenCalledTimes(2)
  })

  it('force pide uno nuevo; clear lo olvida', async () => {
    const fetchJwt = vi.fn(async () => jwtWithExp(Date.now() / 1000 + 600))
    const src = createJwtSource(fetchJwt)
    await src.get()
    await src.get(true)
    expect(fetchJwt).toHaveBeenCalledTimes(2)
    src.clear()
    await src.get()
    expect(fetchJwt).toHaveBeenCalledTimes(3)
  })

  it('peticiones simultáneas comparten una sola consulta de sesión', async () => {
    const fetchJwt = vi.fn(async () => jwtWithExp(Date.now() / 1000 + 600))
    const src = createJwtSource(fetchJwt)
    await Promise.all([src.get(), src.get(), src.get()])
    expect(fetchJwt).toHaveBeenCalledTimes(1)
  })

  it('sin sesión devuelve null y no guarda nada', async () => {
    const fetchJwt = vi.fn(async () => null)
    const src = createJwtSource(fetchJwt)
    expect(await src.get()).toBeNull()
    expect(await src.get()).toBeNull()
    expect(fetchJwt).toHaveBeenCalledTimes(2)
  })
})

describe('kindFor', () => {
  it.each([
    [400, '28000', 'auth'],
    [400, 'P0002', 'not-found'],
    [403, '42501', 'forbidden'],
    [400, '22023', 'invalid'],
    [400, '23514', 'invalid'],
    [401, 'PGRST301', 'auth'],
    [401, 'PGRST302', 'auth'],
    [503, undefined, 'unavailable'],
    [429, undefined, 'unavailable'],
    [418, undefined, 'unknown'],
  ] as const)('%i %s → %s', (status, code, kind) => {
    expect(kindFor(status, code)).toBe(kind)
  })
})

describe('createDataApi', () => {
  const setup = (responses: (Response | Error)[], jwts = ['jwt-1', 'jwt-2']) => {
    const fetchImpl = vi.fn(async () => {
      const next = responses.shift()!
      if (next instanceof Error) throw next
      return next
    })
    let i = 0
    const jwt = { get: vi.fn(async (force?: boolean) => (force ? jwts[++i] : jwts[i]) ?? null), clear: vi.fn() }
    const api = createDataApi({ baseUrl: 'https://api.test/rest/v1/', jwt, fetchImpl: fetchImpl as unknown as typeof fetch })
    return { api, fetchImpl, jwt }
  }

  it('GET con Bearer, sin caché ni cookies', async () => {
    const { api, fetchImpl } = setup([json(200, [{ id: 1 }])])
    expect(await api.select('groups?select=id')).toEqual([{ id: 1 }])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/rest/v1/groups?select=id')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-1')
    expect(init.cache).toBe('no-store')
    expect(init.credentials).toBe('omit')
  })

  it('RPC por POST con argumentos en JSON', async () => {
    const { api, fetchImpl } = setup([json(200, 'uuid-nuevo')])
    expect(await api.rpc('create_group', { p_name: 'Piso' })).toBe('uuid-nuevo')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/rest/v1/rpc/create_group')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"p_name":"Piso"}')
  })

  it('401 → JWT nuevo y un único reintento', async () => {
    const { api, fetchImpl, jwt } = setup([json(401, { code: 'PGRST303' }), json(200, [])])
    expect(await api.select('groups')).toEqual([])
    expect(jwt.get).toHaveBeenLastCalledWith(true)
    const second = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(new Headers(second[1].headers).get('Authorization')).toBe('Bearer jwt-2')
  })

  it('401 dos veces → error de sesión', async () => {
    const { api } = setup([json(401, { code: 'PGRST303' }), json(401, { code: 'PGRST303' })])
    await expect(api.select('groups')).rejects.toMatchObject({ kind: 'auth' })
  })

  it('sin JWT no llama a la red', async () => {
    const { api, fetchImpl } = setup([], [])
    await expect(api.select('groups')).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('errores de las RPC por su código de Postgres', async () => {
    const { api } = setup([json(400, { code: 'P0002', message: 'Código de invitación no válido' })])
    const error = await api.rpc('join_group', { p_invite_code: 'x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DataApiError)
    expect(error).toMatchObject({ kind: 'not-found', status: 400, code: 'P0002' })
  })

  it('sin red → network', async () => {
    const { api } = setup([new TypeError('Failed to fetch')])
    await expect(api.select('groups')).rejects.toMatchObject({ kind: 'network' })
  })

  it('respuesta 5xx sin JSON → unavailable', async () => {
    const { api } = setup([new Response('<html>', { status: 502 })])
    await expect(api.select('groups')).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
