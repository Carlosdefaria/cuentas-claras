// Quitar miembros y borrar el grupo (migración 0010, RF-11) en la rama `test`: solo quien administra, solo con saldo 0,
// quien ya no está no vuelve con el enlace ni ve nada, y lo suyo queda de solo lectura. member_balance coincide con
// computeBalances. Siempre con SET ROLE authenticated / anonymous, como la Data API.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asAnonymous, asUser, ensureUsers, one, sql } from './helpers.ts'
import { splitEqual } from '../../src/domain/split.ts'
import { computeBalances } from '../../src/domain/balances.ts'

let u: Record<string, string> // ana (admin), bea, carla, dani · eva (fuera)
const created: string[] = []

const newGroup = async (name: string, members: string[]) => {
  const id = (await one(u.ana, `select public.create_group($1) as id`, [name])).id as string
  created.push(id)
  const code = (await one(u.ana, `select invite_code from public.groups where id = $1`, [id])).invite_code as string
  for (const m of members) await one(m, `select public.join_group($1)`, [code])
  return { id, code }
}
const expense = async (group: string, actor: string, payer: string, amount: number, people: string[]) => {
  const shares = [...splitEqual(amount, people)].map(([user_id, amount_cents]) => ({ user_id, amount_cents }))
  return (await one(actor, `select public.create_expense($1, 'Gasto', $2, $3, current_date, $4::jsonb) as id`, [group, amount, payer, JSON.stringify(shares)]))
    .id as string
}
const settle = async (group: string, actor: string, from: string, to: string, amount: number) =>
  (await one(actor, `select public.create_settlement($1, $2, $3, $4, current_date) as id`, [group, from, to, amount])).id as string
const removeMember = (actor: string | null, group: string, user: string) => one(actor, `select public.remove_member($1, $2)`, [group, user])
const deleteGroup = (actor: string | null, group: string) => one(actor, `select public.delete_group($1)`, [group])
const members = async (actor: string, group: string) =>
  (await asUser(actor, () => [sql.query(`select user_id, removed_at from public.group_members() where group_id = $1`, [group])]))[0] as {
    user_id: string
    removed_at: string | null
  }[]
const balance = async (group: string, user: string) => Number((await sql.query(`select app_private.member_balance($1, $2) as b`, [group, user]))[0].b)

beforeAll(async () => {
  u = await ensureUsers(['mem-ana', 'mem-bea', 'mem-carla', 'mem-dani', 'mem-eva']).then((m) => ({
    ana: m['mem-ana'], bea: m['mem-bea'], carla: m['mem-carla'], dani: m['mem-dani'], eva: m['mem-eva'],
  }))
})

afterAll(async () => {
  if (u) await sql.query(`delete from public.groups where created_by = any($1::uuid[])`, [Object.values(u)])
})

describe('remove_member', () => {
  it('quien administra quita a alguien con saldo 0: no se borra la fila y queda member_removed', async () => {
    const g = await newGroup('Quitar', [u.bea, u.carla])
    await removeMember(u.ana, g.id, u.carla)
    const row = (await sql.query(`select removed_at from public.memberships where group_id = $1 and user_id = $2`, [g.id, u.carla]))[0]
    expect(row.removed_at).not.toBeNull()
    const acts = await sql.query(`select actor, payload from public.activities where group_id = $1 and type = 'member_removed'`, [g.id])
    expect(acts).toEqual([{ actor: u.ana, payload: { user_id: u.carla, name: 'mem-carla' } }])
    // Los demás la siguen viendo, con removed_at; ella ya no ve nada del grupo.
    expect((await members(u.bea, g.id)).find((m) => m.user_id === u.carla)?.removed_at).not.toBeNull()
    expect((await members(u.bea, g.id)).find((m) => m.user_id === u.bea)?.removed_at).toBeNull()
    expect(await members(u.carla, g.id)).toEqual([])
    const [groups, acts2] = await asUser(u.carla, () => [
      sql.query(`select id from public.groups where id = $1`, [g.id]),
      sql.query(`select id from public.activities where group_id = $1`, [g.id]),
    ])
    expect(groups).toEqual([])
    expect(acts2).toEqual([])
    // Ya no está: no se la puede volver a quitar.
    await expect(removeMember(u.ana, g.id, u.carla)).rejects.toMatchObject({ code: 'P0002' })
  })

  it('quien fue quitado no vuelve con el enlace (ni ve la invitación); el recuento solo cuenta activos', async () => {
    const g = await newGroup('No vuelve', [u.bea])
    await removeMember(u.ana, g.id, u.bea)
    await expect(one(u.bea, `select public.join_group($1)`, [g.code])).rejects.toMatchObject({ code: 'CC002' })
    await expect(one(u.bea, `select * from public.invite_preview($1)`, [g.code])).rejects.toMatchObject({ code: 'CC002' })
    expect(await one(u.eva, `select member_count, is_member from public.invite_preview($1)`, [g.code])).toEqual({ member_count: 1, is_member: false })
    expect(await one(u.ana, `select is_member from public.invite_preview($1)`, [g.code])).toEqual({ is_member: true })
  })

  it('bloqueado si su saldo no es 0 (CC001); tras saldar, se puede', async () => {
    const g = await newGroup('Con deuda', [u.bea])
    await expense(g.id, u.ana, u.ana, 2500, [u.ana, u.bea]) // bea debe 12,50 €
    await expect(removeMember(u.ana, g.id, u.bea)).rejects.toMatchObject({ code: 'CC001' })
    await settle(g.id, u.bea, u.bea, u.ana, 1250)
    await removeMember(u.ana, g.id, u.bea)
  })

  it('a quien le deben tampoco se le puede quitar', async () => {
    const g = await newGroup('Le deben', [u.bea])
    await expense(g.id, u.bea, u.bea, 1000, [u.ana, u.bea])
    await expect(removeMember(u.ana, g.id, u.bea)).rejects.toMatchObject({ code: 'CC001' })
  })

  it('solo quien administra; no a sí mismo; sin sesión ni anonymous', async () => {
    const g = await newGroup('Permisos', [u.bea, u.carla])
    await expect(removeMember(u.bea, g.id, u.carla)).rejects.toMatchObject({ code: '42501' })
    await expect(removeMember(u.eva, g.id, u.carla)).rejects.toMatchObject({ code: '42501' })
    await expect(removeMember(u.ana, g.id, u.ana)).rejects.toMatchObject({ code: '22023' })
    await expect(removeMember(u.ana, g.id, u.eva)).rejects.toMatchObject({ code: 'P0002' })
    await expect(removeMember(null, g.id, u.carla)).rejects.toMatchObject({ code: '28000' })
    await expect(asAnonymous(() => [sql.query(`select public.remove_member($1, $2)`, [g.id, u.carla])])).rejects.toThrow(/permission denied/)
    await expect(one(u.ana, `select app_private.member_balance($1, $2)`, [g.id, u.bea])).rejects.toThrow(/permission denied/)
  })
})

describe('solo lectura de lo de quien ya no está', () => {
  it('gastos y pagos con alguien que ya no está: ni editar ni borrar (CC003); sin él, sí', async () => {
    const g = await newGroup('Solo lectura', [u.bea, u.carla])
    const withCarla = await expense(g.id, u.ana, u.ana, 3000, [u.ana, u.bea, u.carla])
    const paidByCarla = await expense(g.id, u.carla, u.carla, 1500, [u.ana, u.carla])
    const without = await expense(g.id, u.ana, u.ana, 1000, [u.ana, u.bea])
    // Carla: −1000 + 750 = −250 → paga 250 a Ana y queda a 0.
    const settlement = await settle(g.id, u.ana, u.carla, u.ana, 250)
    const other = await settle(g.id, u.ana, u.bea, u.ana, 100)
    await removeMember(u.ana, g.id, u.carla)

    const upd = (id: string) =>
      one(u.ana, `select updated_at::text as updated_at from public.expenses where id = $1`, [id]).then((r) =>
        one(u.ana, `select public.update_expense($1, $2, 'Otro', 1000, $3, current_date, $4::jsonb)`, [
          id, r.updated_at, u.ana, JSON.stringify([{ user_id: u.ana, amount_cents: 1000 }]),
        ]),
      )
    await expect(upd(withCarla)).rejects.toMatchObject({ code: 'CC003' })
    await expect(one(u.ana, `select public.delete_expense($1)`, [withCarla])).rejects.toMatchObject({ code: 'CC003' })
    await expect(one(u.carla, `select public.delete_expense($1)`, [paidByCarla])).rejects.toMatchObject({ code: '42501' })
    await expect(one(u.ana, `select public.delete_settlement($1)`, [settlement])).rejects.toMatchObject({ code: 'CC003' })
    await upd(without)
    await one(u.ana, `select public.delete_settlement($1)`, [other])
    expect(await balance(g.id, u.carla)).toBe(0)

    // Nada nuevo con quien ya no está.
    await expect(expense(g.id, u.ana, u.ana, 1000, [u.ana, u.carla])).rejects.toMatchObject({ code: '22023' })
    await expect(expense(g.id, u.ana, u.carla, 1000, [u.ana])).rejects.toMatchObject({ code: '22023' })
    await expect(settle(g.id, u.ana, u.carla, u.ana, 100)).rejects.toMatchObject({ code: '22023' })
    await expect(expense(g.id, u.carla, u.carla, 1000, [u.carla])).rejects.toMatchObject({ code: '42501' })
  })
})

describe('delete_group', () => {
  it('bloqueado con saldos pendientes (CC001); en paz, se borra (soft delete) y queda group_deleted', async () => {
    const g = await newGroup('Borrar', [u.bea, u.dani])
    await expense(g.id, u.ana, u.ana, 900, [u.ana, u.bea, u.dani])
    await expect(deleteGroup(u.ana, g.id)).rejects.toMatchObject({ code: 'CC001' })
    await settle(g.id, u.bea, u.bea, u.ana, 300)
    await settle(g.id, u.dani, u.dani, u.ana, 300)
    await deleteGroup(u.ana, g.id)
    const row = (await sql.query(`select deleted_at from public.groups where id = $1`, [g.id]))[0]
    expect(row.deleted_at).not.toBeNull()
    expect(await sql.query(`select actor, payload from public.activities where group_id = $1 and type = 'group_deleted'`, [g.id])).toEqual([
      { actor: u.ana, payload: { name: 'Borrar' } },
    ])
    for (const who of [u.ana, u.bea]) {
      const [groups] = await asUser(who, () => [sql.query(`select id from public.groups where id = $1`, [g.id])])
      expect(groups).toEqual([])
    }
    await expect(one(u.eva, `select public.join_group($1)`, [g.code])).rejects.toMatchObject({ code: 'P0002' })
    await expect(deleteGroup(u.ana, g.id)).rejects.toMatchObject({ code: 'P0002' })
  })

  it('solo quien administra; sin sesión ni anonymous', async () => {
    const g = await newGroup('Borrar permisos', [u.bea])
    await expect(deleteGroup(u.bea, g.id)).rejects.toMatchObject({ code: '42501' })
    await expect(deleteGroup(u.eva, g.id)).rejects.toMatchObject({ code: '42501' })
    await expect(deleteGroup(null, g.id)).rejects.toMatchObject({ code: '28000' })
    await expect(asAnonymous(() => [sql.query(`select public.delete_group($1)`, [g.id])])).rejects.toThrow(/permission denied/)
  })
})

describe('member_balance', () => {
  it('coincide con computeBalances con gastos, pagos y borrados aleatorios', async () => {
    const people = [u.ana, u.bea, u.carla, u.dani]
    const g = await newGroup('Aleatorio', [u.bea, u.carla, u.dani])
    let seed = 20261124
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    const expenseIds: string[] = []
    const settlementIds: string[] = []
    for (let i = 0; i < 25; i++) {
      const payer = people[rand(4)]
      const subset = people.filter(() => rand(3) > 0)
      const participants = subset.length ? subset : [payer]
      expenseIds.push(await expense(g.id, payer, payer, 1 + rand(50_000), participants))
      if (rand(3) === 0) {
        const from = people[rand(4)]
        const to = people.find((p) => p !== from && rand(2) === 0) ?? people.find((p) => p !== from)!
        settlementIds.push(await settle(g.id, from, from, to, 1 + rand(20_000)))
      }
    }
    // Borrar algunos (cada uno lo borra quien lo añadió, que es el pagador / quien paga).
    for (const id of expenseIds.filter((_, i) => i % 5 === 0)) {
      const { created_by } = (await sql.query(`select created_by from public.expenses where id = $1`, [id]))[0]
      await one(created_by, `select public.delete_expense($1)`, [id])
    }
    for (const id of settlementIds.filter((_, i) => i % 3 === 0)) {
      const { created_by } = (await sql.query(`select created_by from public.settlements where id = $1`, [id]))[0]
      await one(created_by, `select public.delete_settlement($1)`, [id])
    }

    const expenses = await sql.query(`select id, paid_by, amount_cents, deleted_at from public.expenses where group_id = $1`, [g.id])
    const shares = await sql.query(
      `select s.expense_id, s.user_id, s.amount_cents from public.expense_shares s join public.expenses e on e.id = s.expense_id where e.group_id = $1`,
      [g.id],
    )
    const settlements = await sql.query(`select from_user, to_user, amount_cents from public.settlements where group_id = $1 and deleted_at is null`, [g.id])
    const expected = computeBalances({
      memberIds: people,
      expenses: expenses.map((e) => ({ id: e.id, paidBy: e.paid_by, amountCents: e.amount_cents, deletedAt: e.deleted_at })),
      shares: shares.map((s) => ({ expenseId: s.expense_id, userId: s.user_id, amountCents: s.amount_cents })),
      settlements: settlements.map((s) => ({ fromUser: s.from_user, toUser: s.to_user, amountCents: s.amount_cents })),
    })
    const actual = new Map(await Promise.all(people.map(async (p) => [p, await balance(g.id, p)] as const)))
    expect(actual).toEqual(expected)
    expect([...actual.values()].reduce((a, b) => a + b, 0)).toBe(0)
    expect([...actual.values()].some((b) => b !== 0)).toBe(true)
  })
})
