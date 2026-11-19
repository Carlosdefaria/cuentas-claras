// Tests de app_private.current_user_id() (migración 0002, parche temporal de pg_session_jwt).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asAnonymous, asUser, ensureUsers, sql } from './helpers.ts'

let ana: string

/** Llama a current_user_id() como neondb_owner con el claim indicado (null = sin claim). */
async function withClaim(raw: string | null) {
  const res = await sql.transaction([
    ...(raw === null ? [] : [sql.query(`select set_config('request.jwt.claims', $1, true)`, [raw])]),
    sql.query(`select app_private.current_user_id() as uid`),
  ])
  return res.at(-1)![0].uid as string | null
}

beforeAll(async () => {
  ana = (await ensureUsers(['rls-ana']))['rls-ana']
})

describe('current_user_id(): identidad válida', () => {
  it('devuelve el sub de un claim válido', async () => {
    expect(await withClaim(JSON.stringify({ sub: ana, role: 'authenticated' }))).toBe(ana)
  })
})

describe('current_user_id(): sin identidad → NULL sin error', () => {
  it('sin claim', async () => {
    expect(await withClaim(null)).toBeNull()
  })

  it('claim vacío', async () => {
    expect(await withClaim('')).toBeNull()
  })
})

describe('current_user_id(): claim mal formado → NULL sin error', () => {
  it.each([
    ['no es JSON', 'esto no es json'],
    ['JSON truncado', '{"sub": "'],
    ['es un array', JSON.stringify([{ sub: '00000000-0000-4000-8000-000000000001' }])],
    ['es un string', JSON.stringify('00000000-0000-4000-8000-000000000001')],
    ['objeto vacío', '{}'],
    ['sub no es UUID', JSON.stringify({ sub: 'no-es-un-uuid', role: 'authenticated' })],
    ['sub numérico', JSON.stringify({ sub: 12345, role: 'authenticated' })],
    ['sub con inyección', JSON.stringify({ sub: "00000000-0000-4000-8000-000000000001' or '1'='1", role: 'authenticated' })],
  ])('%s', async (_label, raw) => {
    expect(await withClaim(raw)).toBeNull()
  })
})

describe('current_user_id(): rol anonymous → NULL', () => {
  it('claim con role "anonymous" aunque traiga un sub válido', async () => {
    expect(await withClaim(JSON.stringify({ sub: ana, role: 'anonymous' }))).toBeNull()
  })

  it('sesión con SET ROLE anonymous aunque el claim sea válido', async () => {
    // Función temporal SECURITY DEFINER (como las RPC reales) que anonymous puede ejecutar;
    // desaparece al cerrar la conexión.
    const res = await sql.transaction([
      sql.query(
        `create function pg_temp.cuid_probe() returns uuid language sql security definer set search_path = ''
         as $$ select app_private.current_user_id() $$`,
      ),
      sql.query(
        `do $$ begin execute format('grant usage on schema %I to anonymous',
           (select nspname from pg_namespace where oid = pg_my_temp_schema())); end $$`,
      ),
      sql.query(`grant execute on function pg_temp.cuid_probe() to anonymous`),
      sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ana, role: 'authenticated' })]),
      sql.query(`set local role anonymous`),
      sql.query(`select pg_temp.cuid_probe() as uid`),
    ])
    expect(res.at(-1)![0].uid).toBeNull()
  })

  it('anonymous no puede ejecutar current_user_id() directamente', async () => {
    await expect(asAnonymous(() => [sql.query(`select app_private.current_user_id()`)])).rejects.toThrow(/permission denied/)
  })

  it('authenticated tampoco puede ejecutarla directamente (solo la usan las funciones SECURITY DEFINER)', async () => {
    await expect(asUser(ana, () => [sql.query(`select app_private.current_user_id()`)])).rejects.toThrow(/permission denied/)
  })
})

describe('current_user_id(): caché de la transacción (0004)', () => {
  it('ignora una caché que no es de esta transacción (marca de tiempo distinta)', async () => {
    const res = await sql.transaction([
      sql.query(`select set_config('cuentas_claras.current_user_id', $1, true)`, [`1|${ana}`]),
      sql.query(`select app_private.current_user_id() as uid`),
    ])
    expect(res.at(-1)![0].uid).toBeNull()
  })

  it('la caché no pasa de una transacción a otra', async () => {
    await sql.transaction([
      sql.query(`select set_config('cuentas_claras.current_user_id', (extract(epoch from now()) * 1000000)::bigint::text || '|' || $1, true)`, [ana]),
      sql.query(`select app_private.current_user_id() as uid`),
    ])
    expect(await withClaim(null)).toBeNull()
  })

  it('con SET ROLE anonymous ignora también la caché', async () => {
    const res = await sql.transaction([
      sql.query(
        `create function pg_temp.cuid_probe2() returns uuid language sql security definer set search_path = ''
         as $$ select app_private.current_user_id() $$`,
      ),
      sql.query(
        `do $$ begin execute format('grant usage on schema %I to anonymous',
           (select nspname from pg_namespace where oid = pg_my_temp_schema())); end $$`,
      ),
      sql.query(`grant execute on function pg_temp.cuid_probe2() to anonymous`),
      sql.query(`select set_config('cuentas_claras.current_user_id', (extract(epoch from now()) * 1000000)::bigint::text || '|' || $1, true)`, [ana]),
      sql.query(`set local role anonymous`),
      sql.query(`select pg_temp.cuid_probe2() as uid`),
    ])
    expect(res.at(-1)![0].uid).toBeNull()
  })
})

describe('las RPC usan current_user_id()', () => {
  let groupId: string | undefined

  afterAll(async () => {
    if (groupId) await sql.query(`delete from public.groups where id = $1`, [groupId])
  })

  it('create_group con claim mal formado → No autenticado', async () => {
    await expect(
      sql.transaction([
        sql.query('set local role authenticated'),
        sql.query(`select set_config('request.jwt.claims', 'esto no es json', true)`),
        sql.query(`select public.create_group('no debería crearse')`),
      ]),
    ).rejects.toThrow(/No autenticado/)
  })

  it('create_group con claim role anonymous → No autenticado', async () => {
    await expect(
      sql.transaction([
        sql.query('set local role authenticated'),
        sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ana, role: 'anonymous' })]),
        sql.query(`select public.create_group('no debería crearse')`),
      ]),
    ).rejects.toThrow(/No autenticado/)
  })

  it('create_group con claim válido crea el grupo para ese usuario', async () => {
    const [rows] = await asUser(ana, () => [sql.query(`select public.create_group('Grupo current_user_id') as id`)])
    groupId = rows[0].id
    const [owner] = await sql.query(`select created_by from public.groups where id = $1`, [groupId])
    expect(owner.created_by).toBe(ana)
  })
})
