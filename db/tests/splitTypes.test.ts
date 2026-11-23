// Repartos por importes y por porcentajes (migración 0009) en la rama `test`: create_expense / update_expense con
// p_split_type, validaciones del reparto en la BD y actividad. Siempre con SET ROLE authenticated / anonymous.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asAnonymous, ensureUsers, one, sql } from './helpers.ts'

let u: Record<string, string> // ana, bea, carla · dani (otro grupo)
let group: string

type Share = { user_id: string; amount_cents: number; percent_bp?: number | null }

const create = async (actor: string | null, amount: number, shares: Share[], splitType?: string) =>
  (
    await one(
      actor,
      splitType === undefined
        ? `select public.create_expense($1, 'Alquiler', $2, $3, '2026-11-23', $4::jsonb) as id`
        : `select public.create_expense($1, 'Alquiler', $2, $3, '2026-11-23', $4::jsonb, $5) as id`,
      splitType === undefined ? [group, amount, u.ana, JSON.stringify(shares)] : [group, amount, u.ana, JSON.stringify(shares), splitType],
    )
  ).id as string

const version = async (id: string) => (await sql.query(`select updated_at::text as v from public.expenses where id = $1`, [id]))[0].v as string
const update = async (actor: string, id: string, amount: number, shares: Share[], splitType: string) =>
  one(actor, `select public.update_expense($1, $2, 'Alquiler', $3, $4, '2026-11-23', $5::jsonb, $6)`, [
    id, await version(id), amount, u.ana, JSON.stringify(shares), splitType,
  ])

const saved = async (id: string): Promise<{ split_type: string; amount_cents: number; shares: Share[] }> => {
  const [e] = await sql.query(`select split_type, amount_cents from public.expenses where id = $1`, [id])
  const shares = await sql.query(`select user_id, amount_cents, percent_bp from public.expense_shares where expense_id = $1 order by user_id`, [id])
  return { split_type: String(e.split_type), amount_cents: Number(e.amount_cents), shares: shares as Share[] }
}

const lastChanges = async (id: string) =>
  (await sql.query(`select payload->'changes' as c from public.activities where payload->>'expense_id' = $1 and type = 'expense_updated' order by id desc limit 1`, [id]))[0]?.c

beforeAll(async () => {
  u = await ensureUsers(['spl-ana', 'spl-bea', 'spl-carla', 'spl-dani']).then((m) => ({
    ana: m['spl-ana'], bea: m['spl-bea'], carla: m['spl-carla'], dani: m['spl-dani'],
  }))
  group = (await one(u.ana, `select public.create_group('Repartos RLS') as id`)).id
  const code = (await one(u.ana, `select invite_code from public.groups where id = $1`, [group])).invite_code
  await one(u.bea, `select public.join_group($1)`, [code])
  await one(u.carla, `select public.join_group($1)`, [code])
  await one(u.dani, `select public.create_group('Otro grupo repartos')`)
})

afterAll(async () => {
  if (u) await sql.query(`delete from public.groups where created_by = any($1::uuid[])`, [Object.values(u)])
})

describe('create_expense con tipo de reparto', () => {
  it('sin p_split_type (cliente antiguo): reparto igual, como siempre', async () => {
    const id = await create(u.ana, 1000, [{ user_id: u.ana, amount_cents: 500 }, { user_id: u.bea, amount_cents: 500 }])
    expect(await saved(id)).toMatchObject({ split_type: 'equal' })
  })

  it('por importes: guarda el tipo y las cuotas tal cual', async () => {
    const id = await create(u.ana, 12000, [{ user_id: u.ana, amount_cents: 8000 }, { user_id: u.bea, amount_cents: 4000 }], 'amounts')
    const s = await saved(id)
    expect(s.split_type).toBe('amounts')
    expect(s.shares.map((x: Share) => x.percent_bp)).toEqual([null, null])
  })

  it('por porcentajes: guarda los puntos básicos', async () => {
    const id = await create(
      u.ana,
      10000,
      [
        { user_id: u.ana, amount_cents: 3333, percent_bp: 3333 },
        { user_id: u.bea, amount_cents: 3333, percent_bp: 3333 },
        { user_id: u.carla, amount_cents: 3334, percent_bp: 3334 },
      ],
      'percent',
    )
    const s = await saved(id)
    expect(s.split_type).toBe('percent')
    expect(s.shares.map((x: Share) => x.percent_bp).sort()).toEqual([3333, 3333, 3334])
  })

  it('rechaza porcentajes que no suman 100 %, cuotas que no corresponden y porcentajes fuera de su tipo', async () => {
    const before = (await sql.query(`select count(*)::int as n from public.expenses where group_id = $1`, [group]))[0].n
    await expect(
      create(u.ana, 10000, [{ user_id: u.ana, amount_cents: 5000, percent_bp: 5000 }, { user_id: u.bea, amount_cents: 5000, percent_bp: 4000 }], 'percent'),
    ).rejects.toThrow(/suman 90/)
    await expect(
      create(u.ana, 10000, [{ user_id: u.ana, amount_cents: 9000, percent_bp: 5000 }, { user_id: u.bea, amount_cents: 1000, percent_bp: 5000 }], 'percent'),
    ).rejects.toThrow(/no corresponden/)
    await expect(create(u.ana, 10000, [{ user_id: u.ana, amount_cents: 10000 }], 'percent')).rejects.toThrow(/necesita su porcentaje/)
    await expect(
      create(u.ana, 10000, [{ user_id: u.ana, amount_cents: 10000, percent_bp: 10000 }], 'equal'),
    ).rejects.toThrow(/Solo los repartos por porcentajes/)
    await expect(create(u.ana, 10000, [{ user_id: u.ana, amount_cents: 10000 }], 'raro')).rejects.toThrow(/Tipo de reparto no válido/)
    await expect(create(u.ana, 12000, [{ user_id: u.ana, amount_cents: 8000 }, { user_id: u.bea, amount_cents: 3000 }], 'amounts')).rejects.toThrow(/suman/)
    expect((await sql.query(`select count(*)::int as n from public.expenses where group_id = $1`, [group]))[0].n).toBe(before)
  })

  it('anonymous no puede llamarla; un no miembro tampoco', async () => {
    await expect(
      asAnonymous(() => [sql.query(`select public.create_expense($1, 'x', 1, $2, current_date, '[]'::jsonb, 'equal')`, [group, u.ana])]),
    ).rejects.toThrow(/permission denied/)
    await expect(one(u.dani, `select public.create_expense($1, 'x', 100, $2, current_date, $3::jsonb, 'amounts')`, [
      group, u.dani, JSON.stringify([{ user_id: u.dani, amount_cents: 100 }]),
    ])).rejects.toThrow(/No eres miembro/)
  })
})

describe('update_expense con tipo de reparto', () => {
  it('de igual a porcentajes: guarda el tipo y los porcentajes y registra el cambio de tipo', async () => {
    const id = await create(u.ana, 9000, [
      { user_id: u.ana, amount_cents: 3000 }, { user_id: u.bea, amount_cents: 3000 }, { user_id: u.carla, amount_cents: 3000 },
    ])
    await update(u.ana, id, 9000, [
      { user_id: u.ana, amount_cents: 4500, percent_bp: 5000 },
      { user_id: u.bea, amount_cents: 2700, percent_bp: 3000 },
      { user_id: u.carla, amount_cents: 1800, percent_bp: 2000 },
    ], 'percent')
    const s = await saved(id)
    expect(s.split_type).toBe('percent')
    expect(await lastChanges(id)).toEqual({ split_type: { from: 'equal', to: 'percent' }, split: true })
  })

  it('mismo tipo, otros porcentajes con las mismas personas: «split»', async () => {
    const id = await create(u.ana, 10000, [
      { user_id: u.ana, amount_cents: 5000, percent_bp: 5000 }, { user_id: u.bea, amount_cents: 5000, percent_bp: 5000 },
    ], 'percent')
    await update(u.ana, id, 10000, [
      { user_id: u.ana, amount_cents: 6000, percent_bp: 6000 }, { user_id: u.bea, amount_cents: 4000, percent_bp: 4000 },
    ], 'percent')
    expect(await lastChanges(id)).toEqual({ split: true })
  })

  it('mismos céntimos con otro tipo: también es un cambio (de porcentajes a importes)', async () => {
    const id = await create(u.ana, 10000, [
      { user_id: u.ana, amount_cents: 5000, percent_bp: 5000 }, { user_id: u.bea, amount_cents: 5000, percent_bp: 5000 },
    ], 'percent')
    await update(u.ana, id, 10000, [{ user_id: u.ana, amount_cents: 5000 }, { user_id: u.bea, amount_cents: 5000 }], 'amounts')
    expect((await saved(id)).split_type).toBe('amounts')
    expect(await lastChanges(id)).toEqual({ split_type: { from: 'percent', to: 'amounts' }, split: true })
  })

  it('un reparto mal hecho no deja nada a medias', async () => {
    const id = await create(u.ana, 1000, [{ user_id: u.ana, amount_cents: 500 }, { user_id: u.bea, amount_cents: 500 }])
    await expect(
      update(u.ana, id, 1000, [{ user_id: u.ana, amount_cents: 500, percent_bp: 6000 }, { user_id: u.bea, amount_cents: 500, percent_bp: 4000 }], 'percent'),
    ).rejects.toThrow(/no corresponden/)
    expect(await saved(id)).toMatchObject({ split_type: 'equal', amount_cents: 1000 })
  })
})
