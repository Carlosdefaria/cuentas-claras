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
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return E.network
  if (!error || typeof error !== 'object') return E.generic

  // El SDK normaliza `code` (p. ej. a "validation_failed") y deja el código original del servidor
  // en `error.error.code` (p. ej. USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL): se mira primero ese.
  const { code, status, error: inner } = error as { code?: unknown; status?: unknown; error?: { code?: unknown } }
  for (const candidate of [inner?.code, code]) {
    if (typeof candidate !== 'string') continue
    const message = BY_CODE[candidate.toLowerCase()]
    if (message) return message
  }
  if (status === 429) return E.tooManyRequests
  if (status === 502 || status === 503 || status === 504) return E.unavailable
  return E.generic
}
