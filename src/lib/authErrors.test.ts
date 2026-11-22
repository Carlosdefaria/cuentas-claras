import { describe, expect, it } from 'vitest'
import { authErrorMessage, isEmailNotVerified, needsNewCode } from './authErrors'
import { es } from '../i18n/es'

describe('authErrorMessage', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 401 }, es.auth.errors.invalidCredentials],
    [{ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 }, es.auth.errors.invalidCredentials],
    [{ code: 'USER_ALREADY_EXISTS', status: 422 }, es.auth.errors.userExists],
    [{ code: 'user_already_exists', status: 422 }, es.auth.errors.userExists],
    [{ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', status: 422 }, es.auth.errors.userExists],
    [{ code: 'PASSWORD_TOO_SHORT', status: 400 }, es.auth.errors.passwordTooShort],
    [{ code: 'PASSWORD_TOO_LONG', status: 400 }, es.auth.errors.passwordTooLong],
    [{ code: 'INVALID_EMAIL', status: 400 }, es.auth.errors.invalidEmail],
    [{ code: 'TOO_MANY_REQUESTS', status: 429 }, es.auth.errors.tooManyRequests],
    [{ status: 429 }, es.auth.errors.tooManyRequests],
    [{ code: 'INVALID_OTP', status: 400 }, es.auth.errors.invalidCode],
    [{ code: 'OTP_EXPIRED', status: 400 }, es.auth.errors.codeExpired],
    [{ code: 'TOO_MANY_ATTEMPTS', status: 403 }, es.auth.errors.codeTooManyAttempts],
    [{ code: 'EMAIL_NOT_VERIFIED', status: 403 }, es.auth.errors.emailNotVerified],
  ])('%o → mensaje en español', (error, expected) => {
    expect(authErrorMessage(error)).toBe(expected)
  })

  it('usa el código original del servidor que el SDK deja en error.error (registro duplicado real)', () => {
    const sdkError = { name: 'AuthApiError', code: 'validation_failed', status: 422, error: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'User already exists. Use another email.' } }
    expect(authErrorMessage(sdkError)).toBe(es.auth.errors.userExists)
  })

  it('detecta el email sin verificar (para llevar a la pantalla del código)', () => {
    expect(isEmailNotVerified({ code: 'EMAIL_NOT_VERIFIED', status: 403 })).toBe(true)
    expect(isEmailNotVerified({ code: 'validation_failed', status: 403, error: { code: 'EMAIL_NOT_VERIFIED' } })).toBe(true)
    expect(isEmailNotVerified({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe(false)
    expect(isEmailNotVerified(null)).toBe(false)
  })

  it('distingue los errores que obligan a pedir otro código', () => {
    expect(needsNewCode({ code: 'OTP_EXPIRED' })).toBe(true)
    expect(needsNewCode({ code: 'TOO_MANY_ATTEMPTS' })).toBe(true)
    expect(needsNewCode({ code: 'INVALID_OTP' })).toBe(false)
  })

  it('sin conexión (TypeError de fetch) → mensaje de red', () => {
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(es.auth.errors.network)
  })

  it('502/503 del proxy → servicio no disponible', () => {
    expect(authErrorMessage({ status: 502 })).toBe(es.auth.errors.unavailable)
    expect(authErrorMessage({ status: 503 })).toBe(es.auth.errors.unavailable)
  })

  it('cualquier otro error → genérico, nunca el mensaje técnico en inglés', () => {
    expect(authErrorMessage({ code: 'SOMETHING_NEW', message: 'Internal thing', status: 500 })).toBe(es.auth.errors.generic)
    expect(authErrorMessage(null)).toBe(es.auth.errors.generic)
    expect(authErrorMessage('boom')).toBe(es.auth.errors.generic)
  })
})
