import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import { simplifyDebts } from './simplify'
import { mulberry32, sum } from './testUtils'

const m = (o: Record<string, number>) => new Map(Object.entries(o))

/** Aplica los pagos a los saldos (pagar sube el saldo de quien paga y baja el de quien cobra). */
function apply(balances: Map<string, number>, payments: { fromUser: string; toUser: string; amountCents: number }[]) {
  const delta = computeBalances({ memberIds: [...balances.keys()], expenses: [], shares: [], settlements: payments })
  return new Map([...delta].map(([id, d]) => [id, (balances.get(id) ?? 0) + d]))
}

describe('simplifyDebts (voraz: mayor deudor ↔ mayor acreedor)', () => {
  it('todos en paz: ningún pago', () => {
    expect(simplifyDebts(m({ a: 0, b: 0 }))).toEqual([])
    expect(simplifyDebts(new Map())).toEqual([])
  })

  it('una deuda: un pago directo', () => {
    expect(simplifyDebts(m({ ana: 500, bea: -500 }))).toEqual([{ fromUser: 'bea', toUser: 'ana', amountCents: 500 }])
  })

  it('ejemplo del diseño: Ana +40, Luis +8,75, Carlos −21,25, Marta −27,50 → 3 pagos', () => {
    expect(simplifyDebts(m({ ana: 4000, luis: 875, carlos: -2125, marta: -2750 }))).toEqual([
      { fromUser: 'marta', toUser: 'ana', amountCents: 2750 },
      { fromUser: 'carlos', toUser: 'ana', amountCents: 1250 },
      { fromUser: 'carlos', toUser: 'luis', amountCents: 875 },
    ])
  })

  it('empates: decide el id menor (determinista, no depende del orden del Map)', () => {
    const a = simplifyDebts(m({ d: -100, c: -100, b: 100, a: 100 }))
    const b = simplifyDebts(m({ a: 100, b: 100, c: -100, d: -100 }))
    expect(a).toEqual(b)
    expect(a).toEqual([
      { fromUser: 'c', toUser: 'a', amountCents: 100 },
      { fromUser: 'd', toUser: 'b', amountCents: 100 },
    ])
  })

  it('rechaza saldos que no suman 0 o que no son céntimos enteros', () => {
    expect(() => simplifyDebts(m({ a: 100, b: -99 }))).toThrow()
    expect(() => simplifyDebts(m({ a: 0.5, b: -0.5 }))).toThrow()
  })

  it('aleatorio (500 grupos): ≤ n−1 pagos, importes > 0 enteros, nadie se paga a sí mismo y todos quedan en paz', () => {
    const rand = mulberry32(2026)
    for (let round = 0; round < 500; round++) {
      const n = 1 + Math.floor(rand() * 12)
      const ids = Array.from({ length: n }, (_, i) => `u${String(i).padStart(2, '0')}`)
      const values = ids.map(() => Math.floor((rand() - 0.5) * 200_000))
      values[n - 1] -= sum(values) // que sumen 0
      const balances = new Map(ids.map((id, i) => [id, values[i]]))
      const payments = simplifyDebts(balances)
      const nonZero = values.filter((v) => v !== 0).length
      expect(payments.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1))
      for (const p of payments) {
        expect(Number.isSafeInteger(p.amountCents) && p.amountCents > 0).toBe(true)
        expect(p.fromUser).not.toBe(p.toUser)
        expect(balances.get(p.fromUser)!).toBeLessThan(0) // solo pagan deudores
        expect(balances.get(p.toUser)!).toBeGreaterThan(0) // solo cobran acreedores
      }
      for (const v of apply(balances, payments).values()) expect(v).toBe(0)
    }
  })
})
