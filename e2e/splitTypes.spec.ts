/// <reference lib="dom" />
// Repartos por importes y por porcentajes (RF-05, variante B «Frase y hoja») contra la rama test: elegir el reparto en
// la hoja, filas rellenas con el reparto igual, «Faltan / Cuadra», validación, detalle con %, editar (se recupera el
// reparto guardado) y actividad. Borra lo creado.
import { expect, test, type Page } from '@playwright/test'
import { cleanupUsers, groupOfTwo, row } from './groupUsers.ts'

const created: string[] = []

test.describe.configure({ timeout: 150_000 })

test.afterAll(() => cleanupUsers(created))

async function chooseSplit(page: Page, option: 'A partes iguales' | 'Por importes' | 'Por porcentajes') {
  await page.getByRole('button', { name: /Cambiar cómo se reparte/ }).click()
  const sheet = page.getByRole('dialog', { name: '¿Cómo se reparte?' })
  await expect(sheet).toBeVisible()
  await sheet.getByText(option, { exact: true }).click()
  await expect(sheet).toBeHidden()
}

test('por importes y por porcentajes: se eligen en la hoja, cuadran, se ven en el detalle y se editan', async ({ page, browser }, info) => {
  const { context, id } = await groupOfTwo(page, browser, info, `Repartos e2e ${Math.random().toString(36).slice(2, 6)}`, created, 'split')
  await context.close()

  // --- Por importes: 120 € → filas rellenas con 60 / 60; Bea 50 → faltan 10.
  await page.goto(`/grupos/${id}`)
  await page.getByRole('link', { name: 'Añadir gasto' }).click()
  await page.getByLabel('Importe', { exact: true }).fill('120')
  await page.getByLabel('Concepto').fill('Alquiler')
  await expect(page.getByRole('button', { name: /Cambiar cómo se reparte/ })).toContainText('a partes iguales')
  await chooseSplit(page, 'Por importes')
  await expect(page.getByLabel('Importe de Ana Prueba')).toHaveValue('60')
  await expect(page.getByLabel('Importe de Bea Prueba')).toHaveValue('60')
  await page.getByLabel('Importe de Bea Prueba').fill('50')
  await expect(page.getByText('110,00 € de 120,00 €')).toBeVisible()
  await expect(page.getByText('Faltan 10,00 €')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page.getByText('Los importes tienen que sumar el total del gasto.')).toBeVisible()
  await expect(page.getByLabel('Importe de Ana Prueba')).toBeFocused()
  await page.getByLabel('Importe de Ana Prueba').fill('70')
  await expect(page.getByText('Cuadra')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page).toHaveURL(`/grupos/${id}`)
  await expect(row(page, 'Alquiler')).toContainText('te toca 70,00 €')

  // --- Por porcentajes: 100 € → 50 / 50; Ana 33,33 → faltan 16,67 %; Bea 66,67 → cuadra.
  await page.getByRole('link', { name: 'Añadir gasto' }).click()
  await page.getByLabel('Importe', { exact: true }).fill('100')
  await page.getByLabel('Concepto').fill('Cena')
  await chooseSplit(page, 'Por porcentajes')
  await expect(page.getByLabel('Porcentaje de Ana Prueba')).toHaveValue('50')
  await page.getByLabel('Porcentaje de Ana Prueba').fill('33,33')
  await expect(page.getByText('83,33 % de 100 %')).toBeVisible()
  await expect(page.getByText('Faltan 16,67 %')).toBeVisible()
  await page.getByLabel('Porcentaje de Bea Prueba').fill('66,67')
  await expect(page.getByText('Cuadra')).toBeVisible()
  await expect(row(page, 'Bea Prueba')).toContainText('66,67 €')
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page).toHaveURL(`/grupos/${id}`)
  await expect(row(page, 'Cena')).toContainText('te toca 33,33 €')

  // Saldos: Ana pagó 220 y le tocan 70 + 33,33.
  await page.getByRole('tab', { name: 'Saldos' }).click()
  await expect(page.getByText('Te deben 116,67 €')).toBeVisible()

  // --- Detalle con porcentajes.
  await page.getByRole('tab', { name: 'Gastos' }).click()
  await row(page, 'Cena').getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Reparto · por porcentajes' })).toBeVisible()
  await expect(row(page, 'Bea Prueba')).toContainText('66,67 %')

  // --- Editar: se recupera el reparto guardado; pasar a partes iguales (participan quienes tenían %).
  await page.getByRole('link', { name: 'Editar' }).click()
  await expect(page.getByRole('button', { name: /Cambiar cómo se reparte/ })).toContainText('por porcentajes')
  await expect(page.getByLabel('Porcentaje de Bea Prueba')).toHaveValue('66,67')
  await chooseSplit(page, 'A partes iguales')
  await expect(row(page, 'Bea Prueba')).toContainText('50,00 €')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Reparto', exact: true })).toBeVisible()
  await expect(row(page, 'Bea Prueba')).toContainText('50,00 €')

  // --- Actividad: el cambio de reparto.
  await page.getByRole('button', { name: 'Volver' }).click()
  await page.getByRole('tab', { name: 'Actividad' }).click()
  await expect(page.getByRole('tabpanel').getByRole('listitem').first()).toContainText('reparto: por porcentajes → a partes iguales')
})
