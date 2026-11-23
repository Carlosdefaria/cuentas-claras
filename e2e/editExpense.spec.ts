/// <reference lib="dom" />
// Editar y borrar gastos (RF-06) y la pestaña Actividad (RF-10) contra la rama test: solo quien añadió el gasto puede
// cambiarlo; los saldos se recalculan; la actividad lo cuenta; conflicto si otro cambio llegó antes. Borra lo creado.
import { expect, test, type Page } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'
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

test('quien lo añadió lo edita y lo borra; los demás no; saldos y actividad al día', async ({ page, browser }, info) => {
  const { bea, context, id } = await groupOfTwo(page, browser, info, `Editar e2e ${Math.random().toString(36).slice(2, 6)}`, created, 'edit')
  await addExpense(page, id, '30', 'Cena')

  // Detalle: Ana lo añadió → Editar y Borrar.
  await row(page, 'Cena').getByRole('link').click()
  await expect(page.getByText('Lo añadiste tú')).toBeVisible()
  await page.getByRole('link', { name: 'Editar' }).click()
  await expect(page).toHaveURL(/\/gastos\/[0-9a-f-]+\/editar$/)
  const expenseUrl = page.url().replace(/\/editar$/, '')

  // El formulario viene relleno con el gasto.
  await expect(page.getByLabel('Importe')).toHaveValue('30')
  await expect(page.getByLabel('Concepto')).toHaveValue('Cena')
  await expect(row(page, 'Bea Prueba')).toContainText('15,00 €')

  // «Volver» con cambios sin guardar pide confirmación.
  await page.getByLabel('Importe').fill('42,50')
  page.once('dialog', (dialog) => void dialog.dismiss())
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page).toHaveURL(/\/editar$/)

  await page.getByLabel('Concepto').fill('Cena en Casa Pepe')
  await expect(row(page, 'Bea Prueba')).toContainText('21,25 €')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  // De vuelta en el detalle, con lo nuevo.
  await expect(page).toHaveURL(expenseUrl)
  await expect(page.getByRole('heading', { name: 'Cena en Casa Pepe' })).toBeVisible()
  await expect(page.getByRole('paragraph').filter({ hasText: /^42,50\s€$/ })).toBeVisible()
  await expect(page.getByText(/Lo añadiste tú · editado hoy a las \d\d:\d\d/)).toBeVisible()

  // Bea: ni Editar ni Borrar; aviso de quién puede. Entrar directo a editar tampoco deja.
  await bea.goto(expenseUrl.replace(/^https:\/\/[^/]+/, ''))
  await expect(bea.getByRole('heading', { name: 'Cena en Casa Pepe' })).toBeVisible()
  await expect(bea.getByText('Solo Ana Prueba puede editarlo o borrarlo, porque lo añadió.')).toBeVisible()
  await expect(bea.getByRole('link', { name: 'Editar' })).toHaveCount(0)
  await expect(bea.getByRole('button', { name: 'Borrar' })).toHaveCount(0)
  await bea.goto(`${expenseUrl.replace(/^https:\/\/[^/]+/, '')}/editar`)
  await expect(bea.getByRole('heading', { name: 'No puedes editar este gasto' })).toBeVisible()

  // Saldos recalculados para los dos.
  await bea.goto(`/grupos/${id}?seccion=saldos`)
  await expect(bea.getByText('Debes 21,25 €')).toBeVisible()

  // Borrar: la hoja pide confirmación; Cancelar no borra nada.
  await page.getByRole('button', { name: 'Borrar' }).click()
  const sheet = page.getByRole('dialog', { name: '¿Borrar este gasto?' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Cena en Casa Pepe')
  await expect(sheet).toContainText('42,50 €')
  await expect(sheet.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await sheet.getByRole('button', { name: 'Cancelar' }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'Borrar' }).click()
  await sheet.getByRole('button', { name: 'Borrar gasto' }).click()

  // Vuelve al grupo con el aviso; el gasto ya no está y los saldos vuelven a 0.
  await expect(page).toHaveURL(`/grupos/${id}`)
  await expect(page.getByRole('status').filter({ hasText: 'Gasto borrado: «Cena en Casa Pepe».' })).toBeVisible()
  await expect(page.getByText('Aún no hay gastos')).toBeVisible()
  await page.getByRole('tab', { name: 'Saldos' }).click()
  await expect(page.getByText('Estás en paz')).toBeVisible()

  // Actividad: de lo más reciente a lo más antiguo, con autor.
  await page.getByRole('tab', { name: 'Actividad' }).click()
  await expect(page).toHaveURL(`/grupos/${id}?seccion=actividad`)
  const items = page.getByRole('tabpanel').getByRole('listitem')
  await expect(items).toHaveCount(5)
  await expect(items.nth(0)).toContainText('Tú borraste «Cena en Casa Pepe»')
  await expect(items.nth(0)).toContainText('42,50 € · pagaste tú')
  await expect(items.nth(1)).toContainText('Tú editaste «Cena en Casa Pepe»')
  await expect(items.nth(1)).toContainText('30,00 € → 42,50 € · antes «Cena»')
  await expect(items.nth(2)).toContainText('Tú añadiste «Cena»')
  await expect(items.nth(3)).toContainText('Bea Prueba se unió al grupo')
  await expect(items.nth(4)).toContainText('Tú creaste el grupo')

  // Bea lo ve con el nombre de Ana.
  await bea.goto(`/grupos/${id}?seccion=actividad`)
  await expect(bea.getByRole('tabpanel').getByRole('listitem').first()).toContainText('Ana Prueba borró «Cena en Casa Pepe»')
  await expect(bea.getByRole('tabpanel').getByRole('listitem').nth(3)).toContainText('Tú te uniste al grupo')
  await context.close()
})

test('si el gasto cambió mientras lo editabas, avisa y no pisa el cambio', async ({ page, browser }, info) => {
  const { context, id } = await groupOfTwo(page, browser, info, `Conflicto e2e ${Math.random().toString(36).slice(2, 6)}`, created, 'edit')
  await context.close()
  await addExpense(page, id, '20', 'Taxi')
  await row(page, 'Taxi').getByRole('link').click()
  await page.getByRole('link', { name: 'Editar' }).click()
  await expect(page.getByLabel('Importe')).toHaveValue('20')
  const expenseId = page.url().split('/').at(-2)!

  // Otro móvil guarda antes (se simula subiendo la versión en la BD de test).
  await testSql().query(`update public.expenses set description = 'Taxi al aeropuerto', updated_at = now() where id = $1`, [expenseId])

  await page.getByLabel('Importe').fill('22')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Esto ha cambiado mientras lo tenías abierto.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Ver la versión nueva' }).click()
  await expect(page).toHaveURL(`/grupos/${id}/gastos/${expenseId}`)
  await expect(page.getByRole('heading', { name: 'Taxi al aeropuerto' })).toBeVisible()
  await expect(page.getByRole('paragraph').filter({ hasText: /^20,00\s€$/ })).toBeVisible()
})
