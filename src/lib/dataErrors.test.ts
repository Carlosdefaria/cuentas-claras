import { describe, expect, it } from 'vitest'
import { DataApiError } from './dataApi'
import { dataErrorMessage, isDataError } from './dataErrors'
import { es } from '../i18n/es'

describe('dataErrorMessage', () => {
  it.each([
    ['network', es.data.network],
    ['unavailable', es.data.unavailable],
    ['auth', es.data.auth],
    ['forbidden', es.data.forbidden],
    ['invalid', es.data.invalid],
    ['unknown', es.data.generic],
  ] as const)('%s', (kind, message) => {
    expect(dataErrorMessage(new DataApiError(kind, 400, 'X', 'mensaje técnico en inglés'))).toBe(message)
  })

  it('cualquier otra cosa → genérico', () => {
    expect(dataErrorMessage(new Error('boom'))).toBe(es.data.generic)
    expect(isDataError(new Error('x'), 'network')).toBe(false)
    expect(isDataError(new DataApiError('not-found'), 'not-found')).toBe(true)
  })
})
