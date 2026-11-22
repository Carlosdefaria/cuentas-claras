/// <reference lib="dom" />
// Gastos con reparto igual y saldos contra la rama test: añadir gasto, lista por día, saldos por persona y por grupo
// (cada miembro ve lo suyo), resto de céntimos determinista, validación y error de red. Borra al final lo creado.
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'
import { markVerified } from './otp.ts'

const PASSWORD = 'Prueba-E2E-1234'
const created: string[] = []

test.describe.configure({ timeout: 120_000 })

test.afterAll(async () => {
  if (created.length === 0) return
  const sql = testSql()
  // Primero los grupos (en cascada gastos, cuotas, miembros y actividad); después los usuarios.
  await sql.query(`delete from public.groups where created_by in (select id from neon_auth."user" where email = any($1::text[]))`, [created])
  await sql.query(`delete from neon_auth."user" where email = any($1::text[])`, [created])
})

async function signedInUser(page: Page, name: string, info: TestInfo) {
  const email = `e2e-exp-${name.toLowerCase().split(' ')[0]}-${info.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cuentas-claras.test`
  created.push(email)
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByRole('heading', { name: 'Confirma tu email' })).toBeVisible()
  await markVerified(email)
  await page.getByRole('link', { name: 'Entra', exact: true }).click()
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible()
}

/** Ana crea el grupo y Bea (otro móvil) se une con el enlace. Devuelve la página de Bea y el id del grupo. */
async function groupOfTwo(page: Page, browser: Browser, info: TestInfo, groupName: string) {
  await signedInUser(page, 'Ana Prueba', info)
  await page.getByRole('link', { name: 'Nuevo grupo' }).click()
  await page.getByLabel('Nombre del grupo').fill(groupName)
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  const sheet = page.getByRole('dialog')
  const link = await sheet.getByLabel('Enlace de invitación').inputValue()
  await sheet.getByRole('button', { name: 'Cerrar' }).click()
  const id = page.url().split('/').pop()!.split('?')[0]

  const context = await browser.newContext({ ...info.project.use, baseURL: 'https://localhost:5173', ignoreHTTPSErrors: true })
  const bea = await context.newPage()
  await signedInUser(bea, 'Bea Prueba', info)
  await bea.goto(link)
  await bea.getByRole('button', { name: 'Unirme al grupo' }).click()
  await expect(bea).toHaveURL(`/grupos/${id}`)
  return { bea, context, id }
}

const row = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text })

test('añadir un gasto: aparece en Gastos, cuadra en Saldos y en la lista de grupos de cada uno', async ({ page, browser }, info) => {
  const groupName = `Cena e2e ${Math.random().toString(36).slice(2, 6)}`
  const { bea, context, id } = await groupOfTwo(page, browser, info, groupName)

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Gastos' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Aún no hay gastos')).toBeVisible()
  await page.getByRole('link', { name: 'Añadir gasto' }).click()
  await expect(page).toHaveURL(`/grupos/${id}/gastos/nuevo`)

  await page.getByLabel('Importe').fill('10')
  await page.getByLabel('Concepto').fill('Cena en Alfama')
  // Pagó tú por defecto; todos marcados; cuota en vivo.
  await expect(page.getByLabel('Pagó')).toHaveValue(/.+/)
  await expect(row(page, 'Tú (Ana Prueba)')).toContainText('5,00 €')
  await expect(row(page, 'Bea Prueba')).toContainText('5,00 €')
  await page.getByRole('button', { name: 'Añadir gasto' }).click()

  // Vuelve al grupo con el gasto en «Hoy».
  await expect(page).toHaveURL(`/grupos/${id}`)
  const today = page.getByRole('region', { name: 'Hoy' })
  await expect(today).toContainText('10,00 €')
  await expect(row(page, 'Cena en Alfama')).toContainText('Pagó tú')
  await expect(row(page, 'Cena en Alfama')).toContainText('te toca 5,00 €')

  await page.getByRole('tab', { name: 'Saldos' }).click()
  await expect(page).toHaveURL(`/grupos/${id}?seccion=saldos`)
  await expect(page.getByText('Te deben 5,00 €')).toBeVisible()
  await expect(page.getByText('Has pagado 10,00 € y te tocan 5,00 €.')).toBeVisible()
  await expect(row(page, 'Bea Prueba')).toContainText('Debe 5,00 €')

  // Detalle del gasto con el reparto.
  await page.getByRole('tab', { name: 'Gastos' }).click()
  await row(page, 'Cena en Alfama').getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Cena en Alfama' })).toBeVisible()
  await expect(page.getByText('Pagó tú ·')).toBeVisible()
  await expect(row(page, 'Bea Prueba')).toContainText('5,00 €')
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page).toHaveURL(`/grupos/${id}`)

  await page.goto('/')
  await expect(page.getByText('En total te deben 5,00 €')).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(`${groupName}.*te deben 5,00 €`) })).toBeVisible()

  // Bea ve lo suyo (siempre desde la red).
  await bea.goto('/')
  await expect(bea.getByText('En total debes 5,00 €')).toBeVisible()
  await bea.getByRole('link', { name: new RegExp(groupName) }).click()
  await expect(row(bea, 'Cena en Alfama')).toContainText('Pagó Ana Prueba')
  await bea.getByRole('tab', { name: 'Saldos' }).click()
  await expect(bea.getByText('Debes 5,00 €')).toBeVisible()
  await expect(row(bea, 'Ana Prueba')).toContainText('Le deben 5,00 €')
  await context.close()
})

test('céntimos sobrantes, validación y error de red al guardar', async ({ page, browser }, info) => {
  const { context, id } = await groupOfTwo(page, browser, info, `Resto e2e ${Math.random().toString(36).slice(2, 6)}`)
  await context.close()
  // Se entra con el enlace de la app (como en el móvil), no recargando la página.
  await page.goto(`/grupos/${id}`)
  await page.getByRole('link', { name: 'Añadir gasto' }).click()
  await expect(page).toHaveURL(`/grupos/${id}/gastos/nuevo`)

  // Validación: todo vacío → errores por campo y foco en el importe.
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page.getByText('Escribe el importe.')).toBeVisible()
  await expect(page.getByText('Escribe un concepto.')).toBeVisible()
  await expect(page.getByLabel('Importe')).toBeFocused()
  await expect(page.getByLabel('Importe')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Importe').fill('12,345')
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page.getByText('Escribe un importe en euros, con hasta 2 decimales', { exact: false })).toBeVisible()

  // 10,01 € entre dos: 5,01 y 5,00; el céntimo sobrante va a quien diga la nota (menor user_id).
  await page.getByLabel('Importe').fill('10,01')
  await page.getByLabel('Concepto').fill('Taxi')
  const note = page.getByText(/Sobra 1 céntimo: va a (.+)\./)
  await expect(note).toBeVisible()
  const lucky = (await note.textContent())!.match(/va a (.+)\./)![1]
  await expect(row(page, lucky === 'Ana Prueba' ? 'Tú (Ana Prueba)' : lucky)).toContainText('5,01 €')

  // Nadie marcado → error de participantes.
  await page.getByRole('button', { name: 'Ninguno' }).click()
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page.getByText('Elige al menos una persona.')).toBeVisible()
  await page.getByRole('button', { name: 'Todos' }).click()

  // «Volver» con el gasto a medio escribir pide confirmación; al cancelar, sigue en el formulario.
  page.once('dialog', (dialog) => void dialog.dismiss())
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page).toHaveURL(`/grupos/${id}/gastos/nuevo`)
  await expect(page.getByLabel('Importe')).toHaveValue('10,01')

  // Sin red al guardar: aviso y el formulario conserva lo escrito.
  await page.route('**/rest/v1/rpc/create_expense', (route) => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page.getByText('No hay conexión. Revisa tu internet y vuelve a probar.')).toBeVisible()
  await expect(page.getByLabel('Importe')).toHaveValue('10,01')
  await page.unroute('**/rest/v1/rpc/create_expense')
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page).toHaveURL(`/grupos/${id}`)
  await expect(row(page, 'Taxi')).toContainText('10,01 €')

  // Los saldos suman 0: Ana pagó 10,01 € → le deben la cuota de Bea.
  await page.getByRole('tab', { name: 'Saldos' }).click()
  const beaShare = lucky === 'Bea Prueba' ? '5,01 €' : '5,00 €'
  await expect(page.getByText(`Te deben ${beaShare}`)).toBeVisible()
  await expect(row(page, 'Bea Prueba')).toContainText(`Debe ${beaShare}`)
})
