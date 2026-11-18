import { describe, expect, it } from 'vitest'
import { formatCents, parseEurosToCents } from './money'

// Intl usa espacio duro (U+00A0) entre importe y símbolo; lo normalizamos para comparar.
const fmt = (cents: number) => formatCents(cents).replace(/\s/g, ' ')

describe('parseEurosToCents', () => {
  it.each([
    ['12,34', 1234],
    ['12.34', 1234],
    ['12', 1200],
    ['12,5', 1250],
    ['0,01', 1],
    ['0', 0],
    [' 7,00 ', 700],
    ['1234567,89', 123456789],
  ])('"%s" → %i céntimos', (input, expected) => {
    expect(parseEurosToCents(input)).toBe(expected)
  })

  it('no sufre errores de coma flotante (0,29 → 29, 1,15 → 115, 4,35 → 435)', () => {
    // 0.29 * 100 === 28.999999999999996 en JS: el parseo no debe multiplicar floats.
    expect(parseEurosToCents('0,29')).toBe(29)
    expect(parseEurosToCents('1,15')).toBe(115)
    expect(parseEurosToCents('4,35')).toBe(435)
  })

  it.each(['', '   ', 'abc', '12,345', '-5', '1,2,3', '12,', ',5', '1e3', '12 34', 'NaN', 'Infinity'])(
    'rechaza "%s" devolviendo null',
    (input) => {
      expect(parseEurosToCents(input)).toBeNull()
    },
  )

  it('rechaza importes que no caben como entero seguro', () => {
    expect(parseEurosToCents('99999999999999999')).toBeNull()
  })
})

describe('formatCents', () => {
  it('formatea en euros con convención española', () => {
    expect(fmt(1234)).toBe('12,34 €')
    expect(fmt(5)).toBe('0,05 €')
    expect(fmt(0)).toBe('0,00 €')
    expect(fmt(123456)).toBe('1234,56 €') // es-ES no agrupa miles con 4 cifras
    expect(fmt(1234567)).toBe('12.345,67 €')
  })

  it('formatea negativos (saldo deudor)', () => {
    expect(fmt(-500)).toBe('-5,00 €')
  })

  it('rechaza céntimos no enteros', () => {
    expect(() => formatCents(1.5)).toThrow()
  })
})
