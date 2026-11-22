import { describe, expect, it } from 'vitest'
import { balanceKind, totalBalance } from './balanceText'

describe('balanceKind', () => {
  it.each([
    [1, 'owed'],
    [30182, 'owed'],
    [0, 'settled'],
    [-1, 'owes'],
  ] as const)('%i → %s', (cents, kind) => {
    expect(balanceKind(cents)).toBe(kind)
  })
})

describe('totalBalance', () => {
  it('suma mis saldos de todos los grupos (enteros)', () => {
    expect(totalBalance([30182, -4408, 0])).toBe(25774)
    expect(totalBalance([])).toBe(0)
  })
  it('rechaza importes no enteros', () => {
    expect(() => totalBalance([1.5])).toThrow()
  })
})
