// Lecturas de gastos y saldos (pantallas Gastos, Saldos y saldo en Grupos) en la rama `test`, con RLS.
// Siempre con SET ROLE authenticated / anonymous, como la Data API.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeBalances } from '../../src/domain/balances.ts'
import { sharesFor } from '../../src/domain/expenseForm.ts'
import { asAnonymous, asUser, ensureUsers, one, sql } from './helpers.ts'

let u: Record<string, string> // ana, bea, carla (grupo) · dani (otro grupo) · eva (sin grupo)
let group: string
let other: string
let deletedExpense: string

const createExpense = (actor: string, groupId: string, amount: number, paidBy: string, participants: string[], description = 'Cena') =>
  one(actor, `select public.create_expense($1, $2, $3, $4, current_date, $5::jsonb) as id`, [
    groupId,
    description,
    amount,
    paidBy,
    JSON.stringify(sharesFor(amount, participants).map((s) => ({ user_id: s.userId, amount_cents: s.amountCents }))),
  ])

// Lo que lee la app: gastos vivos con sus cuotas (en la Data API, embebidas con expense_shares(...)).
const readExpenses = (who: string | null, groupId?: string) =>
  asUser(who, () => [
    sql.query(
      `select e.id, e.group_id, e.paid_by, e.amount_cents,
              coalesce((select json_agg(json_build_object('user_id', s.user_id, 'amount_cents', s.amount_cents) order by s.user_id)
                        from public.expense_shares s where s.expense_id = e.id), '[]') as shares
       from public.expenses e
       where e.deleted_at is null and ($1::uuid is null or e.group_id = $1)
       order by e.expense_date desc, e.created_at desc`,
      [groupId ?? null],
    ),
  ]).then(([rows]) => rows as { id: string; group_id: string; paid_by: string; amount_cents: number; shares: { user_id: string; amount_cents: number }[] }[])

beforeAll(async () => {
  u = await ensureUsers(['exp-ana', 'exp-bea', 'exp-carla', 'exp-dani', 'exp-eva']).then((m) => ({
    ana: m['exp-ana'], bea: m['exp-bea'], carla: m['exp-carla'], dani: m['exp-dani'], eva: m['exp-eva'],
  }))
  group = (await one(u.ana, `select public.create_group('Gastos RLS') as id`)).id
  const code = (await one(u.ana, `select invite_code from public.groups where id = $1`, [group])).invite_code
  await one(u.bea, `select public.join_group($1)`, [code])
  await one(u.carla, `select public.join_group($1)`, [code])
  other = (await one(u.dani, `select public.create_group('Otro grupo RLS') as id`)).id

  await createExpense(u.ana, group, 1000, u.ana, [u.ana, u.bea, u.carla]) // 10,00 € entre tres (resto 1 céntimo)
  await createExpense(u.bea, group, 2350, u.bea, [u.ana, u.bea]) // 23,50 € entre dos
  deletedExpense = (await createExpense(u.carla, group, 5000, u.carla, [u.ana, u.carla])).id
  await sql.query(`update public.expenses set deleted_at = now() where id = $1`, [deletedExpense]) // soft delete (owner)
  await createExpense(u.dani, other, 700, u.dani, [u.dani])
})

afterAll(async () => {
  if (u) await sql.query(`delete from public.groups where created_by = any($1::uuid[])`, [Object.values(u)])
})

describe('gastos con cuotas', () => {
  it('un miembro ve los gastos vivos del grupo con todas sus cuotas', async () => {
    const rows = await readExpenses(u.carla, group)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.id)).not.toContain(deletedExpense)
    for (const r of rows) expect(r.shares.reduce((a, s) => a + s.amount_cents, 0)).toBe(r.amount_cents)
  })

  it('el resto de 10,00 € entre tres va al menor user_id', async () => {
    const rows = await readExpenses(u.ana, group)
    const tenEuros = rows.find((r) => r.amount_cents === 1000)!
    const sorted = [u.ana, u.bea, u.carla].sort()
    expect(tenEuros.shares.find((s) => s.user_id === sorted[0])!.amount_cents).toBe(334)
  })

  it('un no miembro no ve ni gastos ni cuotas; sin sesión tampoco', async () => {
    expect(await readExpenses(u.eva, group)).toEqual([])
    expect(await readExpenses(u.dani, group)).toEqual([])
    expect(await readExpenses(null, group)).toEqual([])
    expect((await one(u.eva, `select count(*)::int as n from public.expense_shares`)).n).toBe(0)
  })

  it('leer todos mis gastos (saldo en Grupos) solo devuelve los de mis grupos', async () => {
    const all = await readExpenses(u.dani)
    expect(new Set(all.map((r) => r.group_id))).toEqual(new Set([other]))
    const mine = await readExpenses(u.bea)
    expect(new Set(mine.map((r) => r.group_id))).toEqual(new Set([group]))
  })

  it('anonymous no puede leer gastos, cuotas ni pagos', async () => {
    for (const t of ['expenses', 'expense_shares', 'settlements']) {
      await expect(asAnonymous(() => [sql.query(`select 1 from public.${t} limit 1`)])).rejects.toThrow(/permission denied/)
    }
  })
})

describe('my_group_ids() (migración 0006: RLS que calcula una vez los grupos del usuario)', () => {
  it('devuelve solo mis grupos vivos; sin sesión, ninguno', async () => {
    const [mine] = await asUser(u.bea, () => [sql.query(`select * from app_private.my_group_ids() as g`)])
    expect(mine.map((r) => r.g)).toEqual([group])
    const [none] = await asUser(null, () => [sql.query(`select * from app_private.my_group_ids() as g`)])
    expect(none).toEqual([])
    const [eva] = await asUser(u.eva, () => [sql.query(`select * from app_private.my_group_ids() as g`)])
    expect(eva).toEqual([])
  })
})

describe('saldos calculados con computeBalances sobre lo leído', () => {
  it('suman 0 y cuadran con los gastos vivos (el borrado no cuenta)', async () => {
    const rows = await readExpenses(u.ana, group)
    const [settlements] = await asUser(u.ana, () => [
      sql.query(`select from_user, to_user, amount_cents from public.settlements where group_id = $1 and deleted_at is null`, [group]),
    ])
    const balances = computeBalances({
      memberIds: [u.ana, u.bea, u.carla],
      expenses: rows.map((r) => ({ id: r.id, paidBy: r.paid_by, amountCents: r.amount_cents, deletedAt: null })),
      shares: rows.flatMap((r) => r.shares.map((s) => ({ expenseId: r.id, userId: s.user_id, amountCents: s.amount_cents }))),
      settlements: settlements.map((s) => ({ fromUser: s.from_user, toUser: s.to_user, amountCents: s.amount_cents })),
    })
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0)
    // Carla no ha pagado nada vivo (su gasto está borrado) y participa solo en los 10,00 €.
    const carlaShare = rows.find((r) => r.amount_cents === 1000)!.shares.find((s) => s.user_id === u.carla)!.amount_cents
    expect(balances.get(u.carla)).toBe(-carlaShare)
    // Bea pagó 23,50 € y le tocan 11,75 € de ese gasto y su parte de los 10,00 €.
    const beaShare10 = rows.find((r) => r.amount_cents === 1000)!.shares.find((s) => s.user_id === u.bea)!.amount_cents
    expect(balances.get(u.bea)).toBe(2350 - 1175 - beaShare10)
  })
})
