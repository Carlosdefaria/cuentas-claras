// Pagos para saldar cuentas (migración 0008) en la rama `test`: registrar solo quien paga o cobra, borrar solo quien
// lo registró, actividad y RLS. Siempre con SET ROLE authenticated / anonymous, como la Data API.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asAnonymous, asUser, ensureUsers, one, sql } from './helpers.ts'

let u: Record<string, string> // ana (admin), bea, carla · dani (otro grupo)
let group: string

const create = async (actor: string | null, from: string, to: string, amount: number, on = '2026-11-23') =>
  (await one(actor, `select public.create_settlement($1, $2, $3, $4, $5) as id`, [group, from, to, amount, on])).id as string
const remove = (actor: string | null, id: string) => one(actor, `select public.delete_settlement($1)`, [id])
const row = async (id: string) =>
  (await sql.query(`select from_user, to_user, amount_cents, settled_on::text as on, created_by, deleted_at from public.settlements where id = $1`, [id]))[0]
const acts = async (id: string) =>
  (await sql.query(`select type, actor, payload from public.activities where group_id = $1 and payload->>'settlement_id' = $2 order by id`, [group, id])) as {
    type: string
    actor: string
    payload: Record<string, unknown>
  }[]

beforeAll(async () => {
  u = await ensureUsers(['set-ana', 'set-bea', 'set-carla', 'set-dani']).then((m) => ({
    ana: m['set-ana'], bea: m['set-bea'], carla: m['set-carla'], dani: m['set-dani'],
  }))
  group = (await one(u.ana, `select public.create_group('Pagos RLS') as id`)).id
  const code = (await one(u.ana, `select invite_code from public.groups where id = $1`, [group])).invite_code
  await one(u.bea, `select public.join_group($1)`, [code])
  await one(u.carla, `select public.join_group($1)`, [code])
  await one(u.dani, `select public.create_group('Otro grupo pagos')`)
})

afterAll(async () => {
  if (u) await sql.query(`delete from public.groups where created_by = any($1::uuid[])`, [Object.values(u)])
})

describe('create_settlement', () => {
  it('quien paga lo registra; queda con su autor y settlement_created en la actividad', async () => {
    const id = await create(u.bea, u.bea, u.ana, 1250)
    expect(await row(id)).toMatchObject({ from_user: u.bea, to_user: u.ana, amount_cents: 1250, on: '2026-11-23', created_by: u.bea, deleted_at: null })
    expect(await acts(id)).toEqual([
      { type: 'settlement_created', actor: u.bea, payload: { settlement_id: id, from_user: u.bea, to_user: u.ana, amount_cents: 1250 } },
    ])
  })

  it('quien cobra también puede registrarlo', async () => {
    const id = await create(u.ana, u.carla, u.ana, 500)
    expect((await row(id)).created_by).toBe(u.ana)
  })

  it('un tercero del grupo no puede registrar un pago entre otros dos', async () => {
    await expect(create(u.carla, u.bea, u.ana, 500)).rejects.toThrow(/Solo quien paga o quien cobra/)
  })

  it('no miembro, sin sesión o anonymous: rechazado', async () => {
    await expect(create(u.dani, u.dani, u.ana, 500)).rejects.toThrow(/No eres miembro/)
    await expect(create(null, u.bea, u.ana, 500)).rejects.toThrow(/No autenticado/)
    await expect(
      asAnonymous(() => [sql.query(`select public.create_settlement($1, $2, $3, 1, current_date)`, [group, u.bea, u.ana])]),
    ).rejects.toThrow(/permission denied/)
  })

  it('valida personas e importe', async () => {
    await expect(create(u.bea, u.bea, u.bea, 500)).rejects.toThrow(/personas distintas/)
    await expect(create(u.bea, u.bea, u.dani, 500)).rejects.toThrow(/miembros del grupo/)
    for (const amount of [0, -5, 100_000_001]) await expect(create(u.bea, u.bea, u.ana, amount)).rejects.toThrow(/Importe no válido/)
  })
})

describe('delete_settlement', () => {
  it('quien lo registró lo borra (soft delete) y queda settlement_deleted', async () => {
    const id = await create(u.ana, u.carla, u.ana, 700) // lo registra quien cobra
    await remove(u.ana, id)
    expect((await row(id)).deleted_at).not.toBeNull()
    expect((await acts(id)).map((a) => [a.type, a.actor])).toEqual([
      ['settlement_created', u.ana],
      ['settlement_deleted', u.ana],
    ])
    expect((await acts(id))[1].payload).toEqual({ settlement_id: id, from_user: u.carla, to_user: u.ana, amount_cents: 700 })
    const [rows] = await asUser(u.bea, () => [sql.query(`select id from public.settlements where group_id = $1 and deleted_at is null`, [group])])
    expect(rows.map((r) => r.id)).not.toContain(id)
  })

  it('nadie más puede borrarlo, ni la otra persona del pago; sin sesión ni anonymous tampoco', async () => {
    const id = await create(u.bea, u.bea, u.ana, 300)
    await expect(remove(u.ana, id)).rejects.toThrow(/Solo quien registró el pago/)
    await expect(remove(u.carla, id)).rejects.toThrow(/Solo quien registró el pago/)
    await expect(remove(u.dani, id)).rejects.toThrow(/No eres miembro/)
    await expect(remove(null, id)).rejects.toThrow(/No autenticado/)
    await expect(asAnonymous(() => [sql.query(`select public.delete_settlement($1)`, [id])])).rejects.toThrow(/permission denied/)
    expect((await row(id)).deleted_at).toBeNull()
  })

  it('borrar dos veces o un id inexistente: no encontrado', async () => {
    const id = await create(u.bea, u.bea, u.ana, 300)
    await remove(u.bea, id)
    await expect(remove(u.bea, id)).rejects.toThrow(/Pago no encontrado/)
    await expect(remove(u.bea, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(/Pago no encontrado/)
  })
})

describe('lectura (RLS)', () => {
  it('los miembros leen los pagos de su grupo; los demás no', async () => {
    const read = (who: string | null) =>
      asUser(who, () => [sql.query(`select id from public.settlements where group_id = $1`, [group])]).then(([r]) => r)
    expect((await read(u.carla)).length).toBeGreaterThan(0)
    expect(await read(u.dani)).toEqual([])
    expect(await read(null)).toEqual([])
  })

  it('authenticated no puede escribir en settlements directamente', async () => {
    await expect(
      asUser(u.bea, () => [
        sql.query(`insert into public.settlements (group_id, from_user, to_user, amount_cents, created_by) values ($1, $2, $3, 1, $2)`, [group, u.bea, u.ana]),
      ]),
    ).rejects.toThrow(/permission denied/)
  })
})
