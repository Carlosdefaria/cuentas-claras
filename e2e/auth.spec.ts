/// <reference lib="dom" />
// Login con Neon Auth (rama test) a través del proxy same-origin: registro, sesión persistente,
// rutas protegidas, cierre de sesión y errores. Crea usuarios e2e-*@cuentas-claras.test y los borra al final.
import { expect, test, type Page } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'

const PASSWORD = 'Prueba-E2E-1234'
const created: string[] = []

const newEmail = (project: string) => {
  const email = `e2e-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@cuentas-claras.test`
  created.push(email)
  return email
}

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
}

test.afterAll(async () => {
  if (created.length === 0) return
  const sql = testSql()
  await sql.query(`delete from neon_auth."user" where email = any($1::text[])`, [created])
})

test('registro → Grupos; la sesión sobrevive a recargar y a una pestaña nueva; cerrar sesión', async ({ page, context }, info) => {
  const email = newEmail(info.project.name)
  await signUp(page, 'Ana Prueba', email)

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible()
  await expect(page.getByText('Todavía no tienes grupos')).toBeVisible()

  // Cookie first-party: nuestro dominio, Secure, HttpOnly, SameSite=Lax y sin Partitioned.
  const session = (await context.cookies()).find((c) => c.name === '__Secure-neon-auth.session_token')
  expect(session).toMatchObject({ domain: 'localhost', secure: true, httpOnly: true, sameSite: 'Lax' })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible()

  const other = await context.newPage()
  await other.goto('/cuenta')
  await expect(other.getByText(email)).toBeVisible()
  await expect(other.getByText('Ana Prueba')).toBeVisible()
  await other.close()

  await page.getByRole('link', { name: 'Cuenta' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL('/entrar')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Entra en tu cuenta' })).toBeVisible()
})

test('ruta protegida sin sesión → entrar y volver al destino', async ({ page }, info) => {
  const email = newEmail(info.project.name)
  await signUp(page, 'Bea Prueba', email)
  await expect(page).toHaveURL('/')
  await page.getByRole('link', { name: 'Cuenta' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL('/entrar')

  await page.goto('/cuenta')
  await expect(page).toHaveURL('/entrar?redirectTo=%2Fcuenta')
  await expect(page.getByText('Entra para continuar.')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL('/cuenta')
  await expect(page.getByText(email)).toBeVisible()
})

test('contraseña incorrecta y cuenta ya existente muestran mensajes claros', async ({ page }, info) => {
  const email = newEmail(info.project.name)
  await signUp(page, 'Carla Prueba', email)
  await expect(page).toHaveURL('/')
  await page.getByRole('link', { name: 'Cuenta' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill('contraseña-mala-999')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.')
  await expect(page).toHaveURL('/entrar')

  await signUp(page, 'Carla Otra', email)
  await expect(page.getByRole('alert')).toHaveText('Ya hay una cuenta con ese email. Prueba a entrar.')
})

test('validación en cliente sin llamar al servidor', async ({ page }) => {
  await page.goto('/registro')
  let authCalls = 0
  page.on('request', (r) => {
    if (r.url().includes('/api/auth/sign-up')) authCalls++
  })
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Escribe tu nombre.')).toBeVisible()
  await expect(page.getByText('Escribe tu email.')).toBeVisible()
  await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()
  await expect(page.getByLabel('Nombre')).toBeFocused()

  await page.getByLabel('Nombre').fill('Dani')
  await page.getByLabel('Email').fill('no-es-un-email')
  await page.getByLabel('Contraseña', { exact: true }).fill('corta')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Ese email no parece válido.')).toBeVisible()
  await expect(page.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeVisible()
  expect(authCalls).toBe(0)
})

test('los campos no provocan zoom en iOS (fuente ≥ 16 px) y los botones miden ≥ 44 px', async ({ page }) => {
  await page.goto('/entrar')
  for (const input of await page.locator('input').all()) {
    const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(16)
  }
  // El enlace «Saltar al contenido» está oculto hasta que recibe el foco (se prueba aparte).
  for (const control of await page.locator('button, a:not([href="#contenido"])').all()) {
    const box = await control.boundingBox()
    if (box) expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test('«Saltar al contenido» aparece con el teclado y lleva el foco al contenido', async ({ page, browserName }) => {
  // En WebKit, Tab no recorre enlaces salvo que lo active el sistema (Opción+Tab en Safari).
  test.skip(browserName === 'webkit', 'Tab no enfoca enlaces en WebKit por defecto')
  await page.goto('/entrar')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Saltar al contenido' })
  await expect(skip).toBeFocused()
  const box = await skip.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Enter')
  await expect(page.locator('main#contenido')).toBeFocused()
})
