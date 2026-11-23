/// <reference lib="dom" />
// Registrar pagos y saldar cuentas (RF-08, RF-09) contra la rama test: pagos sugeridos en Saldos, registrar desde la
// hoja (quien paga o quien cobra, parcial o con aviso si es de más), saldos al día, el pago en Gastos y en Actividad,
// y borrar solo quien lo registró. Borra lo creado.
import { expect, test, type Page } from '@playwright/test'
import { cleanupUsers, groupOfTwo, row } from './groupUsers.ts'

const created: string[] = []

test.describe.configure({ timeout: 150_000 })

test.afterAll(() => cleanupUsers(created))

async function addExpense(page: Page, groupId: string, amount: string, description: string) {
  await page.goto(`/grupos/${groupId}`)
  await page.getByRole('link', { name: 'Añadir gasto' }).click()
  await page.getByLabel('Importe').fill(amount)
  await page.getByLabel('Concepto').fill(description)
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page).toHaveURL(`/grupos/${groupId}`)
}

test('saldar cuentas: pagos sugeridos, registrar (parcial y quien cobra), lista, actividad y borrar', async ({ page, browser }, info) => {
  const { bea, context, id } = await groupOfTwo(page, browser, info, `Saldar e2e ${Math.random().toString(36).slice(2, 6)}`, created, 'pay')
  await addExpense(page, id, '30', 'Cena') // Ana pagó 30 € entre las dos → Bea debe 15

  // Bea: el pago sugerido es suyo.
  await bea.goto(`/grupos/${id}?seccion=saldos`)
  await expect(bea.getByText('Para saldar cuentas · 1 pago')).toBeVisible()
  const suggestion = row(bea, 'Pagas a Ana Prueba')
  await expect(suggestion).toContainText('15,00 €')

  // Registra un pago parcial de 10 €.
  await suggestion.getByRole('button', { name: /Registrar/ }).click()
  const sheet = bea.getByRole('dialog', { name: 'Registrar pago' })
  await expect(sheet.getByLabel('Importe')).toHaveValue('15')
  await expect(sheet.getByLabel('Importe')).toBeFocused()
  await sheet.getByLabel('Importe').fill('10')
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(sheet).toBeHidden()
  await expect(bea.getByRole('status').filter({ hasText: 'Pago registrado: 10,00 € a Ana Prueba.' })).toBeVisible()
  await expect(bea.getByText('Debes 5,00 €')).toBeVisible()
  await expect(bea.getByText('Has pagado 0,00 € y te tocan 15,00 €. Has hecho pagos por 10,00 €.')).toBeVisible()
  await expect(row(bea, 'Pagas a Ana Prueba')).toContainText('5,00 €')

  // Más de lo que queda: avisa (pero dejaría registrarlo).
  await row(bea, 'Pagas a Ana Prueba').getByRole('button', { name: /Registrar/ }).click()
  await sheet.getByLabel('Importe').fill('8')
  await expect(sheet.getByText('Es más de lo que queda por saldar entre vosotros (5,00 €).')).toBeVisible()
  await sheet.getByRole('button', { name: 'Cerrar' }).click()
  await expect(sheet).toBeHidden()

  // Ana (quien cobra) registra los 5 € restantes.
  await page.goto(`/grupos/${id}?seccion=saldos`)
  await row(page, 'Bea Prueba te paga').getByRole('button', { name: /Registrar/ }).click()
  await page.getByRole('dialog', { name: 'Registrar pago' }).getByRole('button', { name: 'Registrar pago' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Pago registrado: Bea Prueba te ha pagado 5,00 €.' })).toBeVisible()
  await expect(page.getByText('Estás en paz')).toBeVisible()
  await expect(page.getByText(/Para saldar cuentas/)).toHaveCount(0)

  // Gastos: los pagos tienen su fila y no suman en el total del día.
  await page.getByRole('tab', { name: 'Gastos' }).click()
  const today = page.getByRole('region', { name: /^Hoy/ })
  await expect(today.getByRole('heading')).toContainText('30,00 €')
  await expect(today.getByRole('listitem').filter({ hasText: 'Pago a ti' })).toHaveCount(2)

  // Ana no puede borrar el pago que registró Bea.
  await today.getByRole('listitem').filter({ hasText: '10,00 €' }).getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Pago a ti' })).toBeVisible()
  await expect(page.getByText('Solo Bea Prueba puede borrarlo, porque lo registró.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Borrar pago' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver' }).click()

  // …pero sí el suyo: confirmación, aviso y los saldos vuelven atrás.
  await page.getByRole('region', { name: /^Hoy/ }).getByRole('listitem').filter({ hasText: 'Pago a ti' }).filter({ hasNotText: '10,00' }).getByRole('link').click()
  await expect(page.getByText('Lo registraste tú')).toBeVisible()
  await page.getByRole('button', { name: 'Borrar pago' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Borrar este pago?' })
  await confirm.getByRole('button', { name: 'Borrar pago' }).click()
  await expect(page).toHaveURL(`/grupos/${id}`)
  await expect(page.getByRole('status').filter({ hasText: 'Pago borrado: 5,00 €.' })).toBeVisible()
  await page.getByRole('tab', { name: 'Saldos' }).click()
  await expect(page.getByText('Te deben 5,00 €')).toBeVisible()

  // Actividad.
  await page.getByRole('tab', { name: 'Actividad' }).click()
  const items = page.getByRole('tabpanel').getByRole('listitem')
  await expect(items.nth(0)).toContainText('Tú borraste un pago')
  await expect(items.nth(0)).toContainText('5,00 € · de Bea Prueba a ti')
  await expect(items.nth(1)).toContainText('Tú registraste un pago de Bea Prueba: 5,00 €')
  await expect(items.nth(2)).toContainText('Bea Prueba te pagó 10,00 €')
  await bea.goto(`/grupos/${id}?seccion=actividad`)
  await expect(bea.getByRole('tabpanel').getByRole('listitem').nth(1)).toContainText('Ana Prueba registró un pago tuyo: 5,00 €')
  await expect(bea.getByRole('tabpanel').getByRole('listitem').nth(2)).toContainText('Tú pagaste 10,00 € a Ana Prueba')
  await context.close()
})
