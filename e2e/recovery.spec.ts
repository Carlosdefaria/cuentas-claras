/// <reference lib="dom" />
// Verificación del email y recuperación de contraseña por código (nunca por enlace), contra la rama test.
import { expect, test, type Page } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'
import { clearCodes, markVerified, retryIfRateLimited, setKnownCode } from './otp.ts'

const PASSWORD = 'Prueba-E2E-1234'
const NEW_PASSWORD = 'Nueva-E2E-5678'
const created: string[] = []

// Puede esperar una ventana del límite de peticiones de Neon Auth (ver retryIfRateLimited).
test.describe.configure({ timeout: 180_000 })

const newEmail = (project: string) => {
  const email = `e2e-otp-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@cuentas-claras.test`
  created.push(email)
  return email
}

test.afterAll(async () => {
  if (created.length === 0) return
  await testSql().query(`delete from neon_auth."user" where email = any($1::text[])`, [created])
})

async function signUpConfirmed(page: Page, email: string) {
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Eva Prueba')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByRole('heading', { name: 'Confirma tu email' })).toBeVisible()
  await markVerified(email) // la verificación por código ya se prueba en el primer test
  await page.goto('/entrar')
}

test('registro: el código incorrecto se explica; el correcto abre la sesión', async ({ page }, info) => {
  const email = newEmail(info.project.name)
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Eva Prueba')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  await expect(page).toHaveURL('/verificar')
  await expect(page.getByText(email)).toBeVisible()
  const code = page.getByLabel('Código de 6 cifras')
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
  await expect(code).toHaveAttribute('inputmode', 'numeric')
  await expect(page.getByRole('button', { name: /Reenviar código \(0:\d\d\)/ })).toBeDisabled()

  await setKnownCode(email, 'email-verification', '112233')
  const wrong = page.getByText('El código no es correcto. Revísalo o pide otro.')
  await retryIfRateLimited(page, () => code.fill('999 999'), wrong) // se limpia a 6 cifras y se envía solo
  await expect(code).toHaveValue('')

  await retryIfRateLimited(page, () => code.fill('112233'), page.getByRole('heading', { name: 'Grupos', exact: true }))
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible()
})

test('entrar con una cuenta sin confirmar lleva a escribir el código', async ({ page }, info) => {
  const email = newEmail(info.project.name)
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Fede Prueba')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByRole('heading', { name: 'Confirma tu email' })).toBeVisible()

  await clearCodes(email)
  await page.goto('/entrar')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Confirma tu email' })).toBeVisible()
  await setKnownCode(email, 'email-verification', '445566') // el servidor ha reenviado uno
  await retryIfRateLimited(page, () => page.getByLabel('Código de 6 cifras').fill('445566'), page.getByRole('heading', { name: 'Grupos', exact: true }))
})

test('recuperar la contraseña en dos pasos y entrar con la nueva', async ({ page }, info) => {
  const email = newEmail(info.project.name)
  await signUpConfirmed(page, email)

  // El email escrito en Entrar viaja a Recuperar.
  await page.getByLabel('Email').fill(email)
  await page.getByRole('link', { name: '¿Has olvidado tu contraseña?' }).click()
  await expect(page.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(email)
  await retryIfRateLimited(page, () => page.getByRole('button', { name: 'Enviar código' }).click(), page.getByRole('heading', { name: 'Escribe el código' }))

  // Paso 1: el código (no revela si la cuenta existe).
  await expect(page.getByText('Paso 1 de 2')).toBeVisible()
  await expect(page.getByText(/Si hay una cuenta con/)).toBeVisible()
  await setKnownCode(email, 'forget-password', '778899')
  await retryIfRateLimited(page, () => page.getByLabel('Código de 6 cifras').fill('778800'), page.getByText('El código no es correcto. Revísalo o pide otro.'))
  await retryIfRateLimited(page, () => page.getByLabel('Código de 6 cifras').fill('778899'), page.getByRole('heading', { name: 'Elige tu contraseña' }))

  // Paso 2: la contraseña nueva; al terminar, dentro.
  await expect(page.getByText('Código correcto')).toBeVisible()
  await expect(page.getByLabel('Contraseña nueva')).toBeFocused()
  await page.getByLabel('Contraseña nueva').fill('corta')
  await page.getByRole('button', { name: 'Cambiar contraseña y entrar' }).click()
  await expect(page.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeVisible()
  await page.getByLabel('Contraseña nueva').fill(NEW_PASSWORD)
  await retryIfRateLimited(page, () => page.getByRole('button', { name: 'Cambiar contraseña y entrar' }).click(), page.getByRole('heading', { name: 'Grupos', exact: true }))

  // La antigua ya no vale; la nueva sí.
  await page.getByRole('link', { name: 'Cuenta' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.')
  await page.getByLabel('Contraseña', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible()
})

test('recuperar con un email sin cuenta responde igual (no revela qué emails existen)', async ({ page }, info) => {
  const email = `e2e-nadie-${info.project.name}-${Date.now()}@cuentas-claras.test`
  await page.goto('/recuperar')
  await page.getByLabel('Email').fill(email)
  await retryIfRateLimited(page, () => page.getByRole('button', { name: 'Enviar código' }).click(), page.getByRole('heading', { name: 'Escribe el código' }))
  await expect(page.getByText(email)).toBeVisible()
})

test('sin email en el estado (recarga directa) se vuelve al paso anterior', async ({ page }) => {
  await page.goto('/recuperar/codigo')
  await expect(page).toHaveURL('/recuperar')
  await page.goto('/verificar')
  await expect(page).toHaveURL('/entrar')
})
