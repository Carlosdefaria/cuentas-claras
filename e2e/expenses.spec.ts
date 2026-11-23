/// <reference lib="dom" />
// Gastos con reparto igual y saldos contra la rama test: añadir gasto, lista por día, saldos por persona y por grupo
// (cada miembro ve lo suyo), resto de céntimos determinista, validación y error de red. Borra al final lo creado.
import { expect, test } from '@playwright/test'
import { cleanupUsers, groupOfTwo as groupOf, row } from './groupUsers.ts'
import type { Browser, Page, TestInfo } from '@playwright/test'

const created: string[] = []
const groupOfTwo = (page: Page, browser: Browser, info: TestInfo, name: string) => groupOf(page, browser, info, name, created)

test.describe.configure({ timeout: 120_000 })

test.afterAll(() => cleanupUsers(created))

// Fila de «Todo el grupo» (no la de «Para saldar cuentas», que también lleva el nombre).
const balanceRow = (page: Page, name: string) => row(page, name).filter({ hasText: /Debe|Le deben|En paz/ })

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
  await expect(balanceRow(page, 'Bea Prueba')).toContainText('Debe 5,00 €')

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
  await expect(balanceRow(bea, 'Ana Prueba')).toContainText('Le deben 5,00 €')
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
  await expect(balanceRow(page, 'Bea Prueba')).toContainText(`Debe ${beaShare}`)
})
