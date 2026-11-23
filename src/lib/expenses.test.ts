import { describe, expect, it, vi } from 'vitest'
import type { DataApi } from './dataApi'
import {
  balancesOf,
  createExpense,
  createSettlement,
  deleteExpense,
  deleteSettlement,
  getExpense,
  getSettlement,
  listActivity,
  listExpenses,
  listSettlements,
  myBalancesByGroup,
  updateExpense,
} from './expenses'
import { sharesFor } from '../domain/expenseForm'

const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'
const E1 = '33333333-3333-4333-8333-333333333333'
const raw = (id: string, group: string, paidBy: string, amount: number, shares: [string, number][]) => ({
  id,
  group_id: group,
  description: 'Cena',
  amount_cents: amount,
  paid_by: paidBy,
  expense_date: '2026-11-22',
  created_at: '2026-11-22T20:00:00Z',
  created_by: paidBy,
  updated_at: '2026-11-22T20:00:00.123456+00:00',
  split_type: 'equal',
  expense_shares: shares.map(([user_id, amount_cents]) => ({ user_id, amount_cents, percent_bp: null })),
})

function api(byPath: (path: string) => unknown) {
  const a = { select: vi.fn(async (path: string) => byPath(path)), rpc: vi.fn(async () => E1) }
  return a as typeof a & DataApi
}

describe('lecturas', () => {
  it('listExpenses filtra por grupo, excluye borrados y ordena por fecha', async () => {
    const a = api(() => [raw(E1, G1, 'ana', 1000, [['ana', 500], ['bea', 500]])])
    const [e] = await listExpenses(a, G1)
    expect(e).toMatchObject({ id: E1, groupId: G1, amountCents: 1000, paidBy: 'ana', date: '2026-11-22' })
    expect(e.shares).toEqual([
      { userId: 'ana', amountCents: 500 },
      { userId: 'bea', amountCents: 500 },
    ])
    const path = a.select.mock.calls[0][0]
    expect(path).toContain(`group_id=eq.${G1}`)
    expect(path).toContain('deleted_at=is.null')
    expect(path).toContain('order=expense_date.desc,created_at.desc')
  })

  it('ids que no son uuid no llegan a la red', async () => {
    const a = api(() => [])
    expect(await listExpenses(a, 'x')).toEqual([])
    expect(await getExpense(a, G1, 'x')).toBeNull()
    expect(a.select).not.toHaveBeenCalled()
  })
})

describe('saldos (siempre con computeBalances)', () => {
  it('balancesOf: 10,00 € de Ana entre Ana y Bea → Ana +5,00, Bea −5,00, Carla 0', () => {
    const [e] = [raw(E1, G1, 'ana', 1000, [['ana', 500], ['bea', 500]])].map((r) => ({
      id: r.id, groupId: G1, description: r.description, amountCents: r.amount_cents, paidBy: r.paid_by,
      date: r.expense_date, createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at, splitType: "equal" as const, shares: r.expense_shares.map((s) => ({ userId: s.user_id, amountCents: s.amount_cents })),
    }))
    const b = balancesOf(['ana', 'bea', 'carla'], [e], [{ fromUser: 'bea', toUser: 'ana', amountCents: 200 }])
    expect(Object.fromEntries(b)).toEqual({ ana: 300, bea: -300, carla: 0 })
  })

  it('myBalancesByGroup: mi saldo en cada grupo, con pagos', async () => {
    const a = api((path) =>
      path.startsWith('expenses')
        ? [raw(E1, G1, 'ana', 1000, [['ana', 334], ['bea', 333], ['carla', 333]]), raw('e2', G2, 'dani', 900, [['ana', 450], ['dani', 450]])]
        : [{ group_id: G2, from_user: 'ana', to_user: 'dani', amount_cents: 100 }],
    )
    const mine = await myBalancesByGroup(a, 'ana', [G1, G2])
    expect(Object.fromEntries(mine)).toEqual({ [G1]: 666, [G2]: -350 })
    // Siempre filtrado por mis grupos (índice + RLS solo sobre esas filas).
    for (const [path] of a.select.mock.calls) expect(path).toContain(`group_id=in.(${G1},${G2})`)
  })

  it('sin grupos no hace ninguna petición', async () => {
    const a = api(() => [])
    expect((await myBalancesByGroup(a, 'ana', [])).size).toBe(0)
    expect(a.select).not.toHaveBeenCalled()
  })
})

describe('createExpense', () => {
  it('llama a create_expense con las cuotas en snake_case', async () => {
    const a = api(() => [])
    const id = await createExpense(a, G1, {
      amountCents: 1000, description: 'Cena', paidBy: 'ana', date: '2026-11-22', splitType: 'equal', shares: sharesFor(1000, ['bea', 'ana', 'carla']),
    })
    expect(id).toBe(E1)
    expect(a.rpc).toHaveBeenCalledWith('create_expense', {
      p_group_id: G1,
      p_description: 'Cena',
      p_amount_cents: 1000,
      p_paid_by: 'ana',
      p_expense_date: '2026-11-22',
      p_shares: [
        { user_id: 'ana', amount_cents: 334 },
        { user_id: 'bea', amount_cents: 333 },
        { user_id: 'carla', amount_cents: 333 },
      ],
      p_split_type: 'equal',
    })
  })
})

describe('editar, borrar y actividad', () => {
  it('getExpense trae quién lo añadió y la versión (updated_at) para el bloqueo optimista', async () => {
    const a = api(() => [raw(E1, G1, 'ana', 1000, [['ana', 1000]])])
    const e = await getExpense(a, G1, E1)
    expect(e).toMatchObject({ createdBy: 'ana', updatedAt: '2026-11-22T20:00:00.123456+00:00' })
    expect(a.select.mock.calls[0][0]).toContain('created_by,updated_at')
  })

  it('getExpense trae el tipo de reparto y los porcentajes', async () => {
    const r = { ...raw(E1, G1, 'ana', 1000, []), split_type: 'percent', expense_shares: [{ user_id: 'ana', amount_cents: 600, percent_bp: 6000 }, { user_id: 'bea', amount_cents: 400, percent_bp: 4000 }] }
    const a = api(() => [r])
    expect(await getExpense(a, G1, E1)).toMatchObject({
      splitType: 'percent',
      shares: [{ userId: 'ana', amountCents: 600, percentBp: 6000 }, { userId: 'bea', amountCents: 400, percentBp: 4000 }],
    })
    expect(a.select.mock.calls[0][0]).toContain('split_type,expense_shares(user_id,amount_cents,percent_bp)')
    // Sin porcentaje (igual o por importes) no hay percentBp.
    expect((await getExpense(api(() => [raw(E1, G1, 'ana', 1000, [['ana', 1000]])]), G1, E1))!.shares[0]).toEqual({ userId: 'ana', amountCents: 1000 })
  })

  it('updateExpense manda la versión leída y las cuotas nuevas a la RPC update_expense', async () => {
    const a = api(() => null)
    await updateExpense(a, E1, '2026-11-22T20:00:00.123456+00:00', {
      amountCents: 900,
      description: 'Cena',
      paidBy: 'bea',
      date: '2026-11-21',
      splitType: 'percent',
      shares: [
        { userId: 'ana', amountCents: 540, percentBp: 6000 },
        { userId: 'bea', amountCents: 360, percentBp: 4000 },
      ],
    })
    expect(a.rpc).toHaveBeenCalledWith('update_expense', {
      p_expense_id: E1,
      p_expected_updated_at: '2026-11-22T20:00:00.123456+00:00',
      p_description: 'Cena',
      p_amount_cents: 900,
      p_paid_by: 'bea',
      p_expense_date: '2026-11-21',
      p_shares: [
        { user_id: 'ana', amount_cents: 540, percent_bp: 6000 },
        { user_id: 'bea', amount_cents: 360, percent_bp: 4000 },
      ],
      p_split_type: 'percent',
    })
  })

  it('deleteExpense llama a delete_expense con el id', async () => {
    const a = api(() => null)
    await deleteExpense(a, E1)
    expect(a.rpc).toHaveBeenCalledWith('delete_expense', { p_expense_id: E1 })
  })

  it('listActivity: filtrada por grupo, de la más reciente a la más antigua, en páginas y con cursor', async () => {
    const rows = [
      { id: 12, actor: 'ana', type: 'expense_deleted', payload: { expense_id: E1, description: 'Taxi', amount_cents: 1840, paid_by: 'bea' }, created_at: '2026-11-23T19:02:00Z' },
      { id: 11, actor: 'bea', type: 'member_joined', payload: {}, created_at: '2026-11-22T21:41:00Z' },
      { id: 10, actor: 'bea', type: 'raro', payload: null, created_at: '2026-11-22T21:00:00Z' },
    ]
    const a = api(() => rows)
    const page = await listActivity(a, G1, { limit: 2 })
    const path = a.select.mock.calls[0][0]
    expect(path).toContain(`group_id=eq.${G1}`)
    expect(path).toContain('order=id.desc')
    expect(path).toContain('limit=3') // uno de más para saber si hay otra página
    expect(page.items.map((i) => [i.id, i.actor, i.event.kind])).toEqual([
      [12, 'ana', 'expense_deleted'],
      [11, 'bea', 'member_joined'],
    ])
    expect(page.nextBefore).toBe(11)

    await listActivity(a, G1, { limit: 2, before: 11 })
    expect(a.select.mock.calls[1][0]).toContain('id=lt.11')
  })

  it('listActivity omite los eventos que no se entienden y no pide nada con un id no válido', async () => {
    const a = api(() => [{ id: 3, actor: 'ana', type: 'raro', payload: null, created_at: '2026-11-22T21:00:00Z' }])
    expect((await listActivity(a, G1)).items).toEqual([])
    expect((await listActivity(a, G1)).nextBefore).toBeNull()
    expect(await listActivity(a, 'x')).toEqual({ items: [], nextBefore: null })
  })
})

describe('pagos (settlements)', () => {
  const S1 = '44444444-4444-4444-8444-444444444444'
  const rawS = { id: S1, group_id: G1, from_user: 'bea', to_user: 'ana', amount_cents: 1250, settled_on: '2026-11-23', created_at: '2026-11-23T21:30:00Z', created_by: 'bea' }
  const rowS = { id: S1, groupId: G1, fromUser: 'bea', toUser: 'ana', amountCents: 1250, date: '2026-11-23', createdAt: '2026-11-23T21:30:00Z', createdBy: 'bea' }

  it('listSettlements: vivos, filtrados por grupo, con fecha y autor (más recientes primero)', async () => {
    const a = api(() => [rawS])
    expect(await listSettlements(a, G1)).toEqual([rowS])
    const path = a.select.mock.calls[0][0]
    expect(path).toContain(`group_id=eq.${G1}`)
    expect(path).toContain('deleted_at=is.null')
    expect(path).toContain('order=settled_on.desc,created_at.desc')
  })

  it('getSettlement: uno vivo del grupo, o null; ids no válidos no llegan a la red', async () => {
    const a = api(() => [rawS])
    expect(await getSettlement(a, G1, S1)).toEqual(rowS)
    expect(a.select.mock.calls[0][0]).toContain(`id=eq.${S1}&group_id=eq.${G1}&deleted_at=is.null`)
    expect(await getSettlement(api(() => []), G1, S1)).toBeNull()
    const b = api(() => [])
    expect(await getSettlement(b, G1, 'x')).toBeNull()
    expect(b.select).not.toHaveBeenCalled()
  })

  it('createSettlement y deleteSettlement llaman a sus RPC', async () => {
    const a = api(() => null)
    await createSettlement(a, G1, { fromUser: 'bea', toUser: 'ana', amountCents: 1250, date: '2026-11-23' })
    expect(a.rpc).toHaveBeenCalledWith('create_settlement', {
      p_group_id: G1,
      p_from_user: 'bea',
      p_to_user: 'ana',
      p_amount_cents: 1250,
      p_settled_on: '2026-11-23',
    })
    await deleteSettlement(a, S1)
    expect(a.rpc).toHaveBeenCalledWith('delete_settlement', { p_settlement_id: S1 })
  })
})
