import { describe, expect, it } from 'vitest'
import { splitEqual } from './split'
import { mulberry32, sum } from './testUtils'

describe('splitEqual', () => {
  it('reparte exacto cuando es divisible', () => {
    const r = splitEqual(900, ['a', 'b', 'c'])
    expect(Object.fromEntries(r)).toEqual({ a: 300, b: 300, c: 300 })
  })

  it('1000 entre 3 → 334, 333, 333 (el céntimo sobrante al menor user_id)', () => {
    const r = splitEqual(1000, ['a', 'b', 'c'])
    expect(Object.fromEntries(r)).toEqual({ a: 334, b: 333, c: 333 })
  })

  it('reparte el resto de 1 en 1 por orden ascendente de user_id', () => {
    // 1003 / 4 = 250 resto 3 → los 3 menores reciben 251
    const r = splitEqual(1003, ['d', 'b', 'a', 'c'])
    expect(Object.fromEntries(r)).toEqual({ a: 251, b: 251, c: 251, d: 250 })
  })

  it('es determinista: el orden de entrada no cambia el resultado', () => {
    const ids = ['u-3', 'u-1', 'u-2']
    const base = Object.fromEntries(splitEqual(1000, ids))
    expect(Object.fromEntries(splitEqual(1000, [...ids].reverse()))).toEqual(base)
    expect(Object.fromEntries(splitEqual(1000, ['u-2', 'u-3', 'u-1']))).toEqual(base)
  })

  it('ordena por comparación de código (no por locale) para ser estable en cualquier entorno', () => {
    // 'B' (66) < 'a' (97) en orden de código; localeCompare los ordenaría al revés.
    const r = splitEqual(1, ['a', 'B'])
    expect(r.get('B')).toBe(1)
    expect(r.get('a')).toBe(0)
  })

  it('funciona con UUIDs reales', () => {
    const ids = ['9b2f0c1e-0000-4000-8000-000000000002', '1a2b3c4d-0000-4000-8000-000000000001']
    const r = splitEqual(101, ids)
    expect(r.get('1a2b3c4d-0000-4000-8000-000000000001')).toBe(51)
    expect(r.get('9b2f0c1e-0000-4000-8000-000000000002')).toBe(50)
  })

  it('un solo participante se lleva todo', () => {
    expect(Object.fromEntries(splitEqual(1234, ['a']))).toEqual({ a: 1234 })
  })

  it('total 0 → todos 0', () => {
    expect(Object.fromEntries(splitEqual(0, ['a', 'b']))).toEqual({ a: 0, b: 0 })
  })

  it('total menor que el nº de participantes (2 céntimos entre 3)', () => {
    expect(Object.fromEntries(splitEqual(2, ['c', 'a', 'b']))).toEqual({ a: 1, b: 1, c: 0 })
  })

  it('devuelve una entrada por participante', () => {
    expect(splitEqual(1000, ['a', 'b', 'c']).size).toBe(3)
  })

  it.each([
    ['sin participantes', 100, []],
    ['participantes duplicados', 100, ['a', 'a']],
    ['total negativo', -1, ['a']],
    ['total no entero', 10.5, ['a']],
    ['total no finito', Number.NaN, ['a']],
  ])('lanza error con %s', (_name, total, ids) => {
    expect(() => splitEqual(total as number, ids as string[])).toThrow()
  })

  it('propiedad: la suma de las cuotas siempre es el total y difieren como mucho en 1 céntimo', () => {
    const rand = mulberry32(42)
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rand() * 50)
      const total = Math.floor(rand() * 1_000_000)
      const ids = Array.from({ length: n }, (_, k) => `user-${k}`)
      const shares = [...splitEqual(total, ids).values()]
      expect(sum(shares)).toBe(total)
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
      expect(shares.every(Number.isInteger)).toBe(true)
    }
  })
})
