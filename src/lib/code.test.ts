import { describe, expect, it } from 'vitest'
import { isCompleteCode, normalizeCode } from './code'

describe('normalizeCode', () => {
  it('deja solo cifras y corta a 6', () => {
    expect(normalizeCode('123456')).toBe('123456')
    expect(normalizeCode('123 456')).toBe('123456')
    expect(normalizeCode('Tu código: 482-917')).toBe('482917')
    expect(normalizeCode('12345678')).toBe('123456')
    expect(normalizeCode('abc')).toBe('')
    expect(normalizeCode('١٢٣')).toBe('') // solo cifras ASCII, como las que envía el servidor
  })
})

describe('isCompleteCode', () => {
  it('exige exactamente 6 cifras', () => {
    expect(isCompleteCode('482917')).toBe(true)
    expect(isCompleteCode('48291')).toBe(false)
    expect(isCompleteCode('48291a')).toBe(false)
    expect(isCompleteCode('')).toBe(false)
  })
})

describe('cuenta atrás de «Reenviar código»', () => {
  it('se formatea como m:ss', async () => {
    const { es } = await import('../i18n/es')
    expect(es.auth.code.resendIn(60)).toBe('Reenviar código (1:00)')
    expect(es.auth.code.resendIn(42)).toBe('Reenviar código (0:42)')
    expect(es.auth.code.resendIn(5)).toBe('Reenviar código (0:05)')
  })
})
