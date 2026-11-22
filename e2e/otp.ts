// Códigos por email en los e2e (solo rama `test`): Neon Auth guarda el código como hash SHA-256
// (base64url) con el contador de intentos («hash:intentos»). No hay forma de leerlo en claro, así que
// el test espera a que exista y lo sustituye por el hash de un código conocido.
import { createHash } from 'node:crypto'
import { expect, type Locator, type Page } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'

export type OtpType = 'email-verification' | 'forget-password'

export async function setKnownCode(email: string, type: OtpType, code: string): Promise<void> {
  const sql = testSql()
  const identifier = `${type}-otp-${email}`
  // Espera al código que acaba de enviar el servidor (el envío es asíncrono respecto a la UI).
  await expect
    .poll(async () => (await sql.query(`select 1 from neon_auth.verification where identifier = $1`, [identifier])).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
  const hash = createHash('sha256').update(code).digest('base64url')
  await sql.query(`update neon_auth.verification set value = $1 || ':0' where identifier = $2`, [hash, identifier])
}

/** Borra los códigos pendientes de un email (para esperar al siguiente envío sin confundirlo con el anterior). */
export async function clearCodes(email: string): Promise<void> {
  await testSql().query(`delete from neon_auth.verification where identifier like '%-otp-' || $1`, [email])
}

/** Marca la cuenta como confirmada (tests que no van de verificación: no gastan llamadas de código). */
export async function markVerified(email: string): Promise<void> {
  await testSql().query(`update neon_auth."user" set "emailVerified" = true where email = $1`, [email])
}

/**
 * Neon Auth limita los endpoints de código (unas 3 peticiones/min por IP) y la suite entera lo alcanza.
 * Hace la acción; si la app muestra el aviso de límite, espera a que pase la ventana y la repite.
 */
export async function retryIfRateLimited(page: Page, act: () => Promise<void>, done: Locator): Promise<void> {
  const limited = page.getByText('Demasiados intentos. Espera un minuto y vuelve a probar.')
  await act()
  await expect(done.or(limited).first()).toBeVisible({ timeout: 15_000 })
  if (await done.isVisible()) return
  await page.waitForTimeout(61_000)
  await act()
  await expect(done).toBeVisible({ timeout: 15_000 })
}
