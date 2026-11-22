// Códigos por email de Neon Auth (plugin email OTP de Better Auth): verificar la cuenta y recuperar la
// contraseña. El SDK registra el plugin en tiempo de ejecución pero no lo declara en sus tipos: aquí se
// describe solo lo que usamos y se convierte la respuesta `{ error }` en excepción, como el resto del SDK.
// Nunca por enlace: en iOS la PWA instalada no comparte sesión con Safari (ver CLAUDE.md).

import { authClient } from './auth'

export type OtpType = 'email-verification' | 'forget-password'

interface AuthResult {
  data?: unknown
  error?: { code?: string; message?: string; status?: number } | null
}

interface EmailOtpApi {
  sendVerificationOtp(input: { email: string; type: OtpType }): Promise<AuthResult>
  checkVerificationOtp(input: { email: string; type: OtpType; otp: string }): Promise<AuthResult>
  verifyEmail(input: { email: string; otp: string }): Promise<AuthResult>
  resetPassword(input: { email: string; otp: string; password: string }): Promise<AuthResult>
}

function api(): EmailOtpApi {
  const emailOtp = (authClient as unknown as { emailOtp?: EmailOtpApi }).emailOtp
  if (!emailOtp) throw new Error('El cliente de Neon Auth no incluye el plugin de códigos por email')
  return emailOtp
}

async function run(call: Promise<AuthResult>): Promise<void> {
  const result = await call
  if (result?.error) throw result.error
}

/** Envía (o reenvía) un código. Responde igual exista o no la cuenta: no revela qué emails están dados de alta. */
export const sendCode = (email: string, type: OtpType) => run(api().sendVerificationOtp({ email, type }))

/** Comprueba el código de recuperación sin gastarlo (paso 1 de 2). */
export const checkResetCode = (email: string, otp: string) =>
  run(api().checkVerificationOtp({ email, type: 'forget-password', otp }))

/** Verifica el email; con auto_sign_in_after_verification el servidor deja la sesión abierta. */
export const verifyEmail = (email: string, otp: string) => run(api().verifyEmail({ email, otp }))

/** Cambia la contraseña con el código (paso 2 de 2). Cierra las demás sesiones (revoke_sessions_on_password_reset). */
export const resetPassword = (email: string, otp: string, password: string) =>
  run(api().resetPassword({ email, otp, password }))
