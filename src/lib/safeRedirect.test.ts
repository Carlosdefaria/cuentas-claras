import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  it.each([
    ['/', '/'],
    ['/cuenta', '/cuenta'],
    ['/grupos/abc-123', '/grupos/abc-123'],
    ['/grupos/abc?tab=saldos', '/grupos/abc?tab=saldos'],
    ['/grupos/abc#gastos', '/grupos/abc#gastos'],
    ['/unirse/Xy_9-AbC', '/unirse/Xy_9-AbC'],
  ])('acepta la ruta interna %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['cuenta'], // relativa
    ['//evil.com'],
    ['//evil.com/cuenta'],
    ['/\\evil.com'],
    ['\\\\evil.com'],
    ['/a/..//evil.com'],
    ['https://evil.com'],
    ['http://localhost:5173/cuenta'],
    ['javascript:alert(1)'],
    ['/%2F%2Fevil.com'],
    ['/\t/evil.com'],
    ['/entrar'], // no tiene sentido volver a la pantalla de entrada
    ['/registro'],
  ])('rechaza %s y vuelve al inicio', (input) => {
    expect(safeRedirect(input)).toBe('/')
  })
})
