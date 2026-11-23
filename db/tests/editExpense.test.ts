// Editar y borrar gastos (migración 0007) en la rama `test`: solo quien añadió el gasto, atómico, con actividad.
// Siempre con SET ROLE authenticated / anonymous, como la Data API.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sharesFor } from '../../src/domain/expenseForm.ts'
import { asAnonymous, asUser, ensureUsers, one, sql } from './helpers.ts'

let u: Record<string, string> // ana (admin), bea, carla (miembros) · dani (otro grupo)
let group: string

const sharesJson = (amount: number, participants: string[]) =>
  JSON.stringify(sharesFor(amount, participants).map((s) => ({ user_id: s.userId, amount_cents: s.amountCents })))

const create = async (actor: string, amount: number, paidBy: string, participants: string[], description = 'Cena') =>
  (
    await one(actor, `select public.create_expense($1, $2, $3, $4, '2026-11-20', $5::jsonb) as id`, [
      group, description, amount, paidBy, sharesJson(amount, participants),
    ])
  ).id as string

const version = async (expenseId: string) =>
  (await sql.query(`select updated_at::text as v from public.expenses where id = $1`, [expenseId]))[0].v as string

interface Edit {
  description?: string
  amount?: number
  paidBy?: string
  date?: string
  participants?: string[]
  shares?: string
  expected?: string | null
}
const update = async (actor: string | null, expenseId: string, e: Edit & { amount: number; paidBy: string; participants: string[] }) =>
  one(actor, `select public.update_expense($1, $2, $3, $4, $5, $6, $7::jsonb)::text as v`, [
    expenseId,
    e.expected === undefined ? await version(expenseId) : e.expected,
    e.description ?? 'Cena',
    e.amount,
    e.paidBy,
    e.date ?? '2026-11-20',
    e.shares ?? sharesJson(e.amount, e.participants),
  ])

const remove = (actor: string | null, expenseId: string) => one(actor, `select public.delete_expense($1)`, [expenseId])

const state = async (expenseId: string) => {
  const [e] = await sql.query(
    `select description, amount_cents, paid_by, expense_date::text as date, deleted_at,
            (select json_object_agg(user_id, amount_cents) from public.expense_shares where expense_id = $1) as shares
     from public.expenses where id = $1`,
    [expenseId],
  )
  return e
}

const activities = async (expenseId: string) =>
  (await sql.query(
    `select type, actor, payload from public.activities where group_id = $1 and payload->>'expense_id' = $2 order by id`,
    [group, expenseId],
  )) as { type: string; actor: string; payload: Record<string, unknown> }[]

beforeAll(async () => {
  u = await ensureUsers(['edit-ana', 'edit-bea', 'edit-carla', 'edit-dani']).then((m) => ({
    ana: m['edit-ana'], bea: m['edit-bea'], carla: m['edit-carla'], dani: m['edit-dani'],
  }))
  group = (await one(u.ana, `select public.create_group('Editar gastos') as id`)).id
  const code = (await one(u.ana, `select invite_code from public.groups where id = $1`, [group])).invite_code
  await one(u.bea, `select public.join_group($1)`, [code])
  await one(u.carla, `select public.join_group($1)`, [code])
  await one(u.dani, `select public.create_group('Otro grupo editar')`)
})

afterAll(async () => {
  if (u) await sql.query(`delete from public.groups where created_by = any($1::uuid[])`, [Object.values(u)])
})

describe('update_expense', () => {
  it('quien lo añadió cambia importe, concepto, pagador, fecha y participantes; las cuotas se sustituyen', async () => {
    const id = await create(u.bea, 3600, u.ana, [u.ana, u.bea, u.carla])
    const before = await version(id)
    const v = await update(u.bea, id, { description: '  Cena en Casa Pepe ', amount: 4250, paidBy: u.bea, date: '2026-11-21', participants: [u.ana, u.bea] })
    expect(v.v).not.toBe(before)
    const e = await state(id)
    expect(e).toMatchObject({ description: 'Cena en Casa Pepe', amount_cents: 4250, paid_by: u.bea, date: '2026-11-21', deleted_at: null })
    expect(e.shares).toEqual({ [u.ana]: 2125, [u.bea]: 2125 })
  })

  it('registra expense_updated con el antes y el después de lo que cambió', async () => {
    const id = await create(u.bea, 3600, u.ana, [u.ana, u.bea, u.carla])
    await update(u.bea, id, { amount: 4250, paidBy: u.bea, participants: [u.ana, u.bea] })
    const acts = await activities(id)
    expect(acts.map((a) => a.type)).toEqual(['expense_created', 'expense_updated'])
    const upd = acts[1]
    expect(upd.actor).toBe(u.bea)
    expect(upd.payload).toEqual({
      expense_id: id,
      description: 'Cena',
      amount_cents: 4250,
      changes: {
        amount_cents: { from: 3600, to: 4250 },
        paid_by: { from: u.ana, to: u.bea },
        participants: { added: [], removed: [u.carla] },
      },
    })
  })

  it('sin cambios no escribe ni registra actividad, y devuelve la misma versión', async () => {
    const id = await create(u.bea, 1000, u.bea, [u.bea, u.carla])
    const before = await version(id)
    const v = await update(u.bea, id, { amount: 1000, paidBy: u.bea, participants: [u.carla, u.bea] })
    expect(v.v).toBe(before)
    expect((await activities(id)).map((a) => a.type)).toEqual(['expense_created'])
  })

  it('nadie más puede editarlo: ni otro miembro, ni el admin, ni el pagador', async () => {
    const id = await create(u.bea, 2000, u.carla, [u.bea, u.carla])
    for (const who of [u.ana, u.carla]) {
      await expect(update(who, id, { amount: 1, paidBy: u.bea, participants: [u.bea] })).rejects.toThrow(/Solo quien añadió el gasto/)
    }
    expect((await state(id)).amount_cents).toBe(2000)
  })

  it('un no miembro, sin sesión o anonymous: rechazado', async () => {
    const id = await create(u.bea, 2000, u.bea, [u.bea])
    await expect(update(u.dani, id, { amount: 1, paidBy: u.bea, participants: [u.bea] })).rejects.toThrow(/No eres miembro/)
    await expect(update(null, id, { amount: 1, paidBy: u.bea, participants: [u.bea] })).rejects.toThrow(/No autenticado/)
    await expect(
      asAnonymous(() => [
        sql.query(`select public.update_expense($1, now(), 'x', 1, $2, current_date, '[]'::jsonb)`, [id, u.bea]),
      ]),
    ).rejects.toThrow(/permission denied/)
    expect((await state(id)).amount_cents).toBe(2000)
  })

  it('bloqueo optimista: con una versión antigua no pisa la edición de otro momento', async () => {
    const id = await create(u.bea, 2000, u.bea, [u.bea, u.carla])
    const stale = await version(id)
    await update(u.bea, id, { amount: 2500, paidBy: u.bea, participants: [u.bea, u.carla] })
    await expect(update(u.bea, id, { amount: 9999, paidBy: u.bea, participants: [u.bea], expected: stale })).rejects.toThrow(/ha cambiado/)
    await expect(update(u.bea, id, { amount: 9999, paidBy: u.bea, participants: [u.bea], expected: null })).rejects.toThrow(/ha cambiado/)
    expect((await state(id)).amount_cents).toBe(2500)
  })

  it('valida como create_expense y, si falla, no deja nada a medias', async () => {
    const id = await create(u.bea, 1000, u.bea, [u.bea, u.carla])
    const bad: [Edit & { amount: number; paidBy: string; participants: string[] }, RegExp][] = [
      [{ amount: 1000, paidBy: u.bea, participants: [u.bea], shares: JSON.stringify([{ user_id: u.bea, amount_cents: 999 }]) }, /suman/],
      [{ amount: 1000, paidBy: u.bea, participants: [u.dani] }, /no son miembros/],
      [{ amount: 1000, paidBy: u.dani, participants: [u.bea] }, /pagador/],
      [{ amount: 0, paidBy: u.bea, participants: [u.bea] }, /mayor que 0/],
      [{ amount: 1000, paidBy: u.bea, participants: [], shares: '[]' }, /al menos un participante/],
      [{ description: '   ', amount: 1000, paidBy: u.bea, participants: [u.bea] }, /descripción/],
    ]
    for (const [edit, err] of bad) await expect(update(u.bea, id, edit)).rejects.toThrow(err)
    const e = await state(id)
    expect(e.amount_cents).toBe(1000)
    expect(Object.keys(e.shares).sort()).toEqual([u.bea, u.carla].sort())
    expect((await activities(id)).map((a) => a.type)).toEqual(['expense_created'])
  })

  it('un gasto borrado no se puede editar', async () => {
    const id = await create(u.bea, 1000, u.bea, [u.bea])
    await remove(u.bea, id)
    await expect(update(u.bea, id, { amount: 2000, paidBy: u.bea, participants: [u.bea] })).rejects.toThrow(/Gasto no encontrado/)
  })
})

describe('delete_expense', () => {
  it('quien lo añadió lo borra (soft delete): desaparece de la lectura y queda expense_deleted', async () => {
    const id = await create(u.carla, 1500, u.ana, [u.ana, u.carla], 'Taxi')
    await remove(u.carla, id)
    expect((await state(id)).deleted_at).not.toBeNull()
    const [rows] = await asUser(u.ana, () => [
      sql.query(`select id from public.expenses where group_id = $1 and deleted_at is null`, [group]),
    ])
    expect(rows.map((r) => r.id)).not.toContain(id)
    const acts = await activities(id)
    expect(acts.map((a) => a.type)).toEqual(['expense_created', 'expense_deleted'])
    expect(acts[1].actor).toBe(u.carla)
    expect(acts[1].payload).toEqual({ expense_id: id, description: 'Taxi', amount_cents: 1500, paid_by: u.ana })
  })

  it('nadie más puede borrarlo; sin sesión ni anonymous tampoco', async () => {
    const id = await create(u.carla, 1500, u.ana, [u.ana, u.carla])
    await expect(remove(u.ana, id)).rejects.toThrow(/Solo quien añadió el gasto/)
    await expect(remove(u.bea, id)).rejects.toThrow(/Solo quien añadió el gasto/)
    await expect(remove(u.dani, id)).rejects.toThrow(/No eres miembro/)
    await expect(remove(null, id)).rejects.toThrow(/No autenticado/)
    await expect(asAnonymous(() => [sql.query(`select public.delete_expense($1)`, [id])])).rejects.toThrow(/permission denied/)
    expect((await state(id)).deleted_at).toBeNull()
  })

  it('borrar dos veces o un id inexistente: no encontrado', async () => {
    const id = await create(u.carla, 1500, u.carla, [u.carla])
    await remove(u.carla, id)
    await expect(remove(u.carla, id)).rejects.toThrow(/Gasto no encontrado/)
    await expect(remove(u.carla, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(/Gasto no encontrado/)
    expect((await activities(id)).filter((a) => a.type === 'expense_deleted')).toHaveLength(1)
  })
})

describe('actividad y privilegios', () => {
  it('los miembros leen la actividad de su grupo; los demás no', async () => {
    const read = (who: string | null) =>
      asUser(who, () => [sql.query(`select type from public.activities where group_id = $1`, [group])]).then(([r]) => r)
    expect((await read(u.bea)).length).toBeGreaterThan(0)
    expect(await read(u.dani)).toEqual([])
    expect(await read(null)).toEqual([])
  })

  it('las funciones internas no se pueden llamar desde authenticated', async () => {
    await expect(asUser(u.bea, () => [sql.query(`select app_private.lock_own_expense(gen_random_uuid(), $1)`, [u.bea])])).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      asUser(u.bea, () => [sql.query(`select app_private.check_expense_input($1, 'x', 1, $2, '[]'::jsonb, 'equal')`, [group, u.bea])]),
    ).rejects.toThrow(/permission denied/)
  })
})
