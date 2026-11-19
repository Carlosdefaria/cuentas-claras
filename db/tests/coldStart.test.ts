// Primera llamada tras despertar la rama test (migración 0002).
//
// Reproduce lo que hace la Data API en una conexión nueva: SET ROLE authenticated, fija
// request.jwt.claims y llama a la RPC, SIN precargar pg_session_jwt. Antes de 0002 la primera
// transacción daba "No autenticado" (escritura) o 0 filas (lectura con RLS).
//
// Suspende el compute de test con la API de Neon: necesita NEON_API_KEY
// (contenedor cloud: NEON_API_KEY=proxy-injected npm run test:db). Sin ella se omite.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, ensureUsers, sql } from './helpers.ts'
import { canSuspend, suspendTestEndpoint } from './neonApi.ts'

let ana: string
const created: string[] = []

const rawAsUser = (userId: string, query: string) =>
  sql.transaction([
    sql.query('set local role authenticated'),
    sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]),
    sql.query(query),
  ])

describe.skipIf(!canSuspend())('primera llamada tras arranque en frío', () => {
  beforeAll(async () => {
    ana = (await ensureUsers(['rls-ana']))['rls-ana']
    // Grupo previo (con el compute despierto) para que la lectura en frío tenga algo que ver.
    const [rows] = await asUser(ana, () => [sql.query(`select public.create_group('Grupo previo arranque en frío') as id`)])
    created.push(rows[0].id)
  })

  afterAll(async () => {
    if (created.length) await sql.query(`delete from public.groups where id = any($1::uuid[])`, [created])
  })

  it('escritura: create_group funciona en la primera transacción', async () => {
    await suspendTestEndpoint()
    const res = await rawAsUser(ana, `select public.create_group('Grupo arranque en frío') as id`)
    const id = res.at(-1)![0].id as string
    created.push(id)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  }, 180_000)

  it('lectura con RLS: la primera transacción ve exactamente lo mismo que en caliente', async () => {
    const query = `select count(*)::int as n from public.group_members()`
    const warm = (await rawAsUser(ana, query)).at(-1)![0].n as number
    expect(warm).toBeGreaterThanOrEqual(2) // grupo previo + el del test de escritura
    await suspendTestEndpoint()
    const cold = (await rawAsUser(ana, query)).at(-1)![0].n as number
    expect(cold).toBe(warm)
  }, 180_000)

  it('lectura directa de tablas con RLS en la primera transacción', async () => {
    const query = `select count(*)::int as n from public.groups where id = any($1::uuid[])`
    await suspendTestEndpoint()
    const res = await sql.transaction([
      sql.query('set local role authenticated'),
      sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ana, role: 'authenticated' })]),
      sql.query(query, [created]),
    ])
    expect(res.at(-1)![0].n).toBe(created.length)
  }, 180_000)
})
