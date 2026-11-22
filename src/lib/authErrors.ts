// Traduce los errores de Neon Auth (Better Auth) a mensajes en español.
// El SDK lanza excepciones (AuthApiError con `code` y `status`); fetch lanza TypeError sin red.
// Nunca se muestra el mensaje técnico en inglés del servidor.

import { es } from '../i18n/es'

const E = es.auth.errors

const BY_CODE: Record<string, string> = {
  invalid_credentials: E.invalidCredentials,
  invalid_email_or_password: E.invalidCredentials,
  user_already_exists: E.userExists,
  user_already_exists_use_another_email: E.userExists,
  password_too_short: E.passwordTooShort,
  password_too_long: E.passwordTooLong,
  invalid_email: E.invalidEmail,
  too_many_requests: E.tooManyRequests,
  invalid_otp: E.invalidCode,
  otp_expired: E.codeExpired,
  too_many_attempts: E.codeTooManyAttempts,
  email_not_verified: E.emailNotVerified,
  // Neon Auth rechaza el origen: la dirección de este despliegue no está en sus dominios de confianza.
  invalid_origin: E.invalidOrigin,
}

/** Códigos del servidor (el original en error.error.code y el normalizado por el SDK), en minúsculas. */
function codesOf(error: unknown): string[] {
  if (!error || typeof error !== 'object') return []
  const { code, error: inner } = error as { code?: unknown; error?: { code?: unknown } }
  return [inner?.code, code].filter((c): c is string => typeof c === 'string').map((c) => c.toLowerCase())
}

/** Entrar con un email sin verificar: el servidor ya ha reenviado el código. */
export function isEmailNotVerified(error: unknown): boolean {
  return codesOf(error).includes('email_not_verified')
}

/** El código ya no sirve (caducado o agotado): hay que pedir otro. */
export function needsNewCode(error: unknown): boolean {
  return codesOf(error).some((c) => c === 'otp_expired' || c === 'too_many_attempts')
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return E.network
  if (!error || typeof error !== 'object') return E.generic

  // El SDK normaliza `code` (p. ej. a "validation_failed") y deja el código original del servidor
  // en `error.error.code` (p. ej. USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL): se mira primero ese.
  for (const candidate of codesOf(error)) {
    const message = BY_CODE[candidate]
    if (message) return message
  }
  const { status } = error as { status?: unknown }
  if (status === 429) return E.tooManyRequests
  if (status === 502 || status === 503 || status === 504) return E.unavailable
  return E.generic
}
