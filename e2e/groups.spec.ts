/// <reference lib="dom" />
// Grupos e invitaciones contra la rama test: crear grupo, invitar, unirse con el enlace sin cuenta
// (registro → código → de vuelta a la invitación) y estados de error. Borra al final los grupos y usuarios creados.
import { expect, test, type Browser, type Page } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'
import { markVerified, retryIfRateLimited, setKnownCode } from './otp.ts'

const PASSWORD = 'Prueba-E2E-1234'
const created: string[] = []

// Puede esperar una ventana del límite de peticiones de Neon Auth (ver retryIfRateLimited).
test.describe.configure({ timeout: 180_000 })

const newEmail = (project: string, who: string) => {
  const email = `e2e-grp-${who}-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@cuentas-claras.test`
  created.push(email)
  return email
}

test.afterAll(async () => {
  if (created.length === 0) return
  const sql = testSql()
  // Primero los grupos (en cascada miembros y actividad): los usuarios no se pueden borrar mientras los referencien.
  await sql.query(
    `delete from public.groups where created_by in (select id from neon_auth."user" where email = any($1::text[]))`,
    [created],
  )
  await sql.query(`delete from neon_auth."user" where email = any($1::text[])`, [created])
})

async function fillSignUp(page: Page, name: string, email: string) {
  await page.getByLabel('Nombre').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByRole('heading', { name: 'Confirma tu email' })).toBeVisible()
}

/** Cuenta confirmada sin gastar llamadas de código (se marca en la BD) y sesión abierta en `/`. */
async function signedInUser(page: Page, name: string, email: string) {
  await page.goto('/registro')
  await fillSignUp(page, name, email)
  await markVerified(email)
  await page.getByRole('link', { name: 'Entra', exact: true }).click()
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible()
}

async function createGroup(page: Page, name: string): Promise<{ id: string; link: string }> {
  await page.getByRole('link', { name: 'Nuevo grupo' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo grupo' })).toBeVisible()
  await page.getByLabel('Nombre del grupo').fill(name)
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  await expect(page).toHaveURL(/\/grupos\/[0-9a-f-]{36}$/) // ?invitar=1 se limpia de la URL
  const id = page.url().split('/').pop()!
  // Recién creado: la hoja «Invitar» está abierta.
  const sheet = page.getByRole('dialog', { name: `Invita a ${name}` })
  await expect(sheet).toBeVisible()
  const link = await sheet.getByLabel('Enlace de invitación').inputValue()
  expect(link).toMatch(/^https:\/\/localhost:5173\/unirse\/[A-Za-z0-9_-]{22,}$/)
  return { id, link }
}

async function newPhone(browser: Browser, project: { use: object }) {
  const context = await browser.newContext({ ...project.use, baseURL: 'https://localhost:5173', ignoreHTTPSErrors: true })
  return { context, page: await context.newPage() }
}

test('crear grupo, invitar y unirse con el enlace sin tener cuenta (registro → código → grupo)', async ({ page, browser, browserName }, info) => {
  const ana = newEmail(info.project.name, 'ana')
  const groupName = `Lisboa e2e ${Math.random().toString(36).slice(2, 6)}`
  await signedInUser(page, 'Ana Prueba', ana)
  await expect(page.getByText('Todavía no tienes grupos')).toBeVisible()

  const { id, link } = await createGroup(page, groupName)
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Copiar enlace' }).click()
  await expect(sheet.getByText(/Enlace copiado\.|Mantén pulsado el enlace/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Cerrar' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: 'Invitar' })).toBeFocused() // el foco vuelve a quien abrió la hoja

  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
  await expect(page.getByText('1 miembro · Euro (€)')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Gastos' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Miembros' }).click()
  await expect(page).toHaveURL(`/grupos/${id}?seccion=miembros`) // la pestaña queda en la URL
  await expect(page.getByRole('listitem').filter({ hasText: 'Ana Prueba' })).toContainText('Tú · Administra')

  // La hoja se vuelve a abrir con el botón y se cierra con Escape.
  await page.getByRole('button', { name: 'Invitar' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page.getByRole('link', { name: new RegExp(`${groupName}.*1 miembro`) })).toBeVisible()

  // Otra persona, sin cuenta, abre el enlace en su móvil.
  const bea = newEmail(info.project.name, 'bea')
  const phone = await newPhone(browser, info.project)
  const p2 = phone.page
  await p2.goto(link)
  await expect(p2.getByRole('heading', { name: 'Te han invitado' })).toBeVisible()
  await p2.getByRole('link', { name: 'Crear cuenta y unirme' }).click()
  await expect(p2).toHaveURL(/\/registro\?redirectTo=%2Funirse%2F/)
  await expect(p2.getByText('Crea tu cuenta para unirte al grupo.')).toBeVisible()
  // Con una invitación pendiente no se sugiere instalar (la app instalada empezaría en «/»).
  await expect(p2.getByText(/Instálala en tu/)).toHaveCount(0)
  await fillSignUp(p2, 'Bea Prueba', bea)
  await expect(p2).toHaveURL(/\/verificar\?redirectTo=%2Funirse%2F/)

  const invitation = p2.getByRole('heading', { name: 'Invitación' })
  if (browserName === 'webkit') {
    // iOS primero: el camino completo con el código real (el destino sobrevive a registro → verificación).
    await setKnownCode(bea, 'email-verification', '246810')
    await retryIfRateLimited(p2, () => p2.getByLabel('Código de 6 cifras').fill('246810'), invitation)
  } else {
    // En Chromium sin gastar llamadas de código: confirmar en la BD y «Entra», que también conserva el destino.
    await markVerified(bea)
    await p2.getByRole('link', { name: 'Entra', exact: true }).click()
    await expect(p2.getByText('Entra para unirte al grupo.')).toBeVisible()
    await p2.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
    await p2.getByRole('button', { name: 'Entrar' }).click()
  }
  await expect(invitation).toBeVisible()
  await expect(p2.getByRole('heading', { name: groupName })).toBeVisible()
  await expect(p2.getByText('1 miembro', { exact: true })).toBeVisible()

  await p2.getByRole('button', { name: 'Unirme al grupo' }).click()
  await expect(p2).toHaveURL(`/grupos/${id}`)
  await expect(p2.getByText(`Ya estás en «${groupName}».`)).toBeVisible()
  await expect(p2.getByText('2 miembros · Euro (€)')).toBeVisible()
  await p2.getByRole('tab', { name: 'Miembros' }).click()
  await expect(p2.getByRole('listitem').filter({ hasText: 'Bea Prueba' })).toContainText('Tú')
  await expect(p2.getByRole('listitem').filter({ hasText: 'Ana Prueba' })).toContainText('Administra')

  // Volver a abrir el enlace ya siendo miembro lleva directamente al grupo.
  await p2.goto(link)
  await expect(p2).toHaveURL(`/grupos/${id}`)
  await expect(p2.getByRole('heading', { name: groupName })).toBeVisible()
  await phone.context.close()

  // Quien creó el grupo ve al nuevo miembro (siempre desde la red, sin caché).
  await page.reload()
  await expect(page.getByRole('link', { name: new RegExp(`${groupName}.*2 miembros`) })).toBeVisible()
})

test('enlaces no válidos, pegar un enlace y error de red con Reintentar', async ({ page }, info) => {
  await signedInUser(page, 'Carla Prueba', newEmail(info.project.name, 'carla'))

  // Código con formato válido pero inexistente, y código mal formado.
  await page.goto('/unirse/AAAAAAAAAAAAAAAAAAAAAA')
  await expect(page.getByRole('heading', { name: 'Este enlace no es válido' })).toBeVisible()
  await page.goto('/unirse/corto')
  await expect(page.getByRole('heading', { name: 'Este enlace no es válido' })).toBeVisible()
  await page.getByRole('link', { name: 'Ir a mis grupos' }).click()
  await expect(page).toHaveURL('/')

  // «Unirme con un enlace»: texto que no es un enlace → error; el enlace dentro de un mensaje → invitación.
  await page.getByRole('link', { name: 'Unirme con un enlace' }).click()
  const field = page.getByLabel('Enlace o código de invitación')
  await field.fill('hola')
  await page.getByRole('button', { name: 'Ver la invitación' }).click()
  await expect(page.getByText('No reconocemos ese enlace.', { exact: false })).toBeVisible()
  await expect(field).toBeFocused()
  await field.fill('Únete: https://otra.app/unirse/BBBBBBBBBBBBBBBBBBBBBB')
  await page.getByRole('button', { name: 'Ver la invitación' }).click()
  await expect(page).toHaveURL('/unirse/BBBBBBBBBBBBBBBBBBBBBB')
  await expect(page.getByRole('heading', { name: 'Este enlace no es válido' })).toBeVisible()

  // Grupo ajeno o inexistente.
  await page.goto('/grupos/00000000-0000-4000-8000-000000000000')
  await expect(page.getByRole('heading', { name: 'No encontramos este grupo' })).toBeVisible()

  // La Data API no responde: error con Reintentar, y al reintentar carga.
  let fail = true
  await page.route('**/rest/v1/groups**', (route) => (fail ? route.abort('internetdisconnected') : route.continue()))
  await page.goto('/')
  await expect(page.getByText('No hemos podido cargar tus grupos')).toBeVisible()
  await expect(page.getByText('No hay conexión. Revisa tu internet y vuelve a probar.')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('Todavía no tienes grupos')).toBeVisible()
})

test('crear grupo: el nombre es obligatorio', async ({ page }, info) => {
  await signedInUser(page, 'Dani Prueba', newEmail(info.project.name, 'dani'))
  await page.getByRole('link', { name: 'Nuevo grupo' }).click()
  await page.getByLabel('Nombre del grupo').fill('   ')
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  await expect(page.getByText('Escribe un nombre para el grupo.')).toBeVisible()
  await expect(page.getByLabel('Nombre del grupo')).toBeFocused()
  await expect(page.getByLabel('Nombre del grupo')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Nombre del grupo')).toHaveAttribute('maxlength', '100')
})
