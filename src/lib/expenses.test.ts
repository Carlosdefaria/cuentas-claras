import { describe, expect, it, vi } from 'vitest'
import type { DataApi } from './dataApi'
import { balancesOf, createExpense, getExpense, listExpenses, myBalancesByGroup } from './expenses'
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
  expense_shares: shares.map(([user_id, amount_cents]) => ({ user_id, amount_cents })),
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
      date: r.expense_date, createdAt: r.created_at, shares: r.expense_shares.map((s) => ({ userId: s.user_id, amountCents: s.amount_cents })),
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
      amountCents: 1000, description: 'Cena', paidBy: 'ana', date: '2026-11-22', shares: sharesFor(1000, ['bea', 'ana', 'carla']),
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
    })
  })
})
