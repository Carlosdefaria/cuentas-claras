import { describe, expect, it } from 'vitest'
import { computeBalances, type Expense, type ExpenseShare, type Settlement } from './balances'
import { splitEqual } from './split'
import { mulberry32, sum } from './testUtils'

/** Crea un gasto con reparto igual y devuelve gasto + cuotas (como vendrían de la BD). */
function equalExpense(
  id: string,
  paidBy: string,
  amountCents: number,
  participants: string[],
  deletedAt: string | null = null,
): { expense: Expense; shares: ExpenseShare[] } {
  const shares = [...splitEqual(amountCents, participants)].map(([userId, cents]) => ({
    expenseId: id,
    userId,
    amountCents: cents,
  }))
  return { expense: { id, paidBy, amountCents, deletedAt }, shares }
}

function build(items: { expense: Expense; shares: ExpenseShare[] }[]) {
  return { expenses: items.map((i) => i.expense), shares: items.flatMap((i) => i.shares) }
}

const obj = (m: Map<string, number>) => Object.fromEntries(m)

describe('computeBalances', () => {
  it('grupo sin movimientos: todos los miembros a 0', () => {
    const r = computeBalances({ memberIds: ['a', 'b'], expenses: [], shares: [], settlements: [] })
    expect(obj(r)).toEqual({ a: 0, b: 0 })
  })

  it('A paga 10 € entre A y B → A +5 €, B −5 €', () => {
    const { expenses, shares } = build([equalExpense('e1', 'a', 1000, ['a', 'b'])])
    const r = computeBalances({ memberIds: ['a', 'b'], expenses, shares, settlements: [] })
    expect(obj(r)).toEqual({ a: 500, b: -500 })
  })

  it('10 € entre 3 → cuotas 3,34/3,33/3,33 y saldos que suman 0', () => {
    const { expenses, shares } = build([equalExpense('e1', 'a', 1000, ['a', 'b', 'c'])])
    const r = computeBalances({ memberIds: ['a', 'b', 'c'], expenses, shares, settlements: [] })
    // a paga 1000 y su cuota es 334 → +666; b y c deben 333
    expect(obj(r)).toEqual({ a: 666, b: -333, c: -333 })
    expect(sum(r.values())).toBe(0)
  })

  it('ejemplo de viaje calculado a mano', () => {
    // Ana paga hotel 300 € entre los 3; Bea paga cena 90 € entre los 3; Carlos paga taxi 20 € entre Ana y él.
    const { expenses, shares } = build([
      equalExpense('hotel', 'ana', 30000, ['ana', 'bea', 'carlos']),
      equalExpense('cena', 'bea', 9000, ['ana', 'bea', 'carlos']),
      equalExpense('taxi', 'carlos', 2000, ['ana', 'carlos']),
    ])
    const r = computeBalances({ memberIds: ['ana', 'bea', 'carlos'], expenses, shares, settlements: [] })
    // Ana:    pagó 30000; cuotas 10000 + 3000 + 1000 = 14000 → +16000
    // Bea:    pagó  9000; cuotas 10000 + 3000        = 13000 →  −4000
    // Carlos: pagó  2000; cuotas 10000 + 3000 + 1000 = 14000 → −12000
    expect(obj(r)).toEqual({ ana: 16000, bea: -4000, carlos: -12000 })
  })

  it('el pagador puede no participar en el gasto', () => {
    const { expenses, shares } = build([equalExpense('regalo', 'a', 1000, ['b', 'c'])])
    const r = computeBalances({ memberIds: ['a', 'b', 'c'], expenses, shares, settlements: [] })
    expect(obj(r)).toEqual({ a: 1000, b: -500, c: -500 })
  })

  it('ignora los gastos borrados (soft delete) y sus cuotas', () => {
    const { expenses, shares } = build([
      equalExpense('e1', 'a', 1000, ['a', 'b']),
      equalExpense('e2', 'b', 5000, ['a', 'b'], '2026-11-18T10:00:00Z'),
    ])
    const r = computeBalances({ memberIds: ['a', 'b'], expenses, shares, settlements: [] })
    expect(obj(r)).toEqual({ a: 500, b: -500 })
  })

  it('un pago (liquidación) reduce la deuda: el que paga sube, el que cobra baja', () => {
    const { expenses, shares } = build([equalExpense('e1', 'a', 1000, ['a', 'b'])])
    const settlements: Settlement[] = [{ fromUser: 'b', toUser: 'a', amountCents: 500 }]
    const r = computeBalances({ memberIds: ['a', 'b'], expenses, shares, settlements })
    expect(obj(r)).toEqual({ a: 0, b: 0 })
  })

  it('un pago parcial deja la deuda restante', () => {
    const { expenses, shares } = build([equalExpense('e1', 'a', 1000, ['a', 'b'])])
    const settlements: Settlement[] = [{ fromUser: 'b', toUser: 'a', amountCents: 200 }]
    const r = computeBalances({ memberIds: ['a', 'b'], expenses, shares, settlements })
    expect(obj(r)).toEqual({ a: 300, b: -300 })
  })

  it('incluye a quien aparece en movimientos aunque no esté en memberIds (ex-miembro)', () => {
    const { expenses, shares } = build([equalExpense('e1', 'a', 1000, ['a', 'old'])])
    const r = computeBalances({ memberIds: ['a'], expenses, shares, settlements: [] })
    expect(obj(r)).toEqual({ a: 500, old: -500 })
  })

  it('lanza error si las cuotas de un gasto no suman su importe (datos corruptos)', () => {
    const expenses: Expense[] = [{ id: 'e1', paidBy: 'a', amountCents: 1000, deletedAt: null }]
    const shares: ExpenseShare[] = [
      { expenseId: 'e1', userId: 'a', amountCents: 500 },
      { expenseId: 'e1', userId: 'b', amountCents: 499 },
    ]
    expect(() => computeBalances({ memberIds: [], expenses, shares, settlements: [] })).toThrow(/e1/)
  })

  it('lanza error si una cuota apunta a un gasto inexistente', () => {
    const shares: ExpenseShare[] = [{ expenseId: 'ghost', userId: 'a', amountCents: 100 }]
    expect(() => computeBalances({ memberIds: [], expenses: [], shares, settlements: [] })).toThrow(/ghost/)
  })

  it('lanza error con importes no enteros', () => {
    const expenses: Expense[] = [{ id: 'e1', paidBy: 'a', amountCents: 10.5, deletedAt: null }]
    const shares: ExpenseShare[] = [{ expenseId: 'e1', userId: 'a', amountCents: 10.5 }]
    expect(() => computeBalances({ memberIds: [], expenses, shares, settlements: [] })).toThrow()
  })

  it('propiedad: con datos aleatorios la suma de saldos del grupo siempre es 0', () => {
    const rand = mulberry32(7)
    for (let round = 0; round < 200; round++) {
      const members = Array.from({ length: 2 + Math.floor(rand() * 10) }, (_, k) => `m${k}`)
      const pick = () => members[Math.floor(rand() * members.length)]
      const items = Array.from({ length: Math.floor(rand() * 40) }, (_, k) => {
        const participants = members.filter(() => rand() < 0.6)
        if (participants.length === 0) participants.push(pick())
        const deleted = rand() < 0.1 ? '2026-01-01T00:00:00Z' : null
        return equalExpense(`e${k}`, pick(), Math.floor(rand() * 100_000), participants, deleted)
      })
      const settlements: Settlement[] = Array.from({ length: Math.floor(rand() * 5) }, () => ({
        fromUser: pick(),
        toUser: pick(),
        amountCents: Math.floor(rand() * 10_000),
      }))
      const { expenses, shares } = build(items)
      const r = computeBalances({ memberIds: members, expenses, shares, settlements })
      expect(sum(r.values())).toBe(0)
      expect([...r.values()].every(Number.isInteger)).toBe(true)
    }
  })

  it('rendimiento: 50 miembros y 5.000 gastos en < 200 ms', () => {
    const rand = mulberry32(1)
    const members = Array.from({ length: 50 }, (_, k) => `member-${k}`)
    const items = Array.from({ length: 5000 }, (_, k) => {
      const participants = members.filter(() => rand() < 0.5)
      if (participants.length === 0) participants.push(members[0])
      return equalExpense(`e${k}`, members[k % 50], 1 + Math.floor(rand() * 50_000), participants)
    })
    const { expenses, shares } = build(items)
    const start = performance.now()
    const r = computeBalances({ memberIds: members, expenses, shares, settlements: [] })
    const elapsed = performance.now() - start
    expect(sum(r.values())).toBe(0)
    expect(elapsed).toBeLessThan(200)
  })
})
