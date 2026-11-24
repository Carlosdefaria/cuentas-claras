/// <reference lib="dom" />
// Quitar miembros y borrar el grupo (RF-11, variante C «Ficha de persona») contra la rama test: la ficha bloqueada por
// saldo y con «Ver cómo saldar», quitar con saldo 0, quien ya no está (gris, «ya no está», solo lectura, sin acceso ni
// vuelta con el enlace), la actividad, y borrar el grupo (bloqueado con saldos, después vuelta a Grupos con aviso).
// Borra lo creado.
import { expect, test, type Page } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'
import { cleanupUsers, groupOfTwo, row, signedInUser } from './groupUsers.ts'

const created: string[] = []

test.describe.configure({ timeout: 240_000 })

test.afterAll(() => cleanupUsers(created))

async function pay(page: Page, groupId: string, to: string) {
  await page.goto(`/grupos/${groupId}?seccion=saldos`)
  await row(page, `Pagas a ${to}`).getByRole('button', { name: /Registrar/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Registrar pago' })
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Estás en paz')).toBeVisible()
}

test('quitar a alguien y borrar el grupo: solo con saldo 0, solo lectura e historial', async ({ page, browser }, info) => {
  const name = `Miembros e2e ${Math.random().toString(36).slice(2, 6)}`
  const { bea, context, id } = await groupOfTwo(page, browser, info, name, created, 'mem')
  const code = (await testSql().query(`select invite_code from public.groups where id = $1`, [id]))[0].invite_code as string

  const carlaContext = await browser.newContext({ ...info.project.use, baseURL: 'https://localhost:5173', ignoreHTTPSErrors: true })
  const carla = await carlaContext.newPage()
  await signedInUser(carla, 'Carla Prueba', info, created, 'mem')
  await carla.goto(`/unirse/${code}`)
  await carla.getByRole('button', { name: 'Unirme al grupo' }).click()
  await expect(carla).toHaveURL(`/grupos/${id}`)

  // Ana paga 30 € entre las tres: Bea y Carla deben 10 € cada una.
  await page.goto(`/grupos/${id}`)
  await page.getByRole('link', { name: 'Añadir gasto' }).click()
  await page.getByLabel('Importe').fill('30')
  await page.getByLabel('Concepto').fill('Cena')
  await page.getByRole('button', { name: 'Añadir gasto' }).click()
  await expect(page).toHaveURL(`/grupos/${id}`)

  // Quien no administra: lista sin fichas ni «Borrar grupo…».
  await bea.goto(`/grupos/${id}?seccion=miembros`)
  await expect(row(bea, 'Carla Prueba')).toBeVisible()
  await expect(bea.getByRole('button', { name: /Carla Prueba/ })).toHaveCount(0)
  await expect(bea.getByRole('button', { name: 'Borrar grupo…' })).toHaveCount(0)

  // Ana: la ficha de Bea está bloqueada por su saldo; «Ver cómo saldar» lleva a Saldos.
  await page.goto(`/grupos/${id}?seccion=miembros`)
  await expect(page.getByText('3 miembros · Euro (€)')).toBeVisible()
  await page.getByRole('button', { name: /Bea Prueba/ }).click()
  let sheet = page.getByRole('dialog', { name: 'Bea Prueba' })
  await expect(sheet.getByText('Debe 10,00 €')).toBeVisible()
  await expect(sheet.getByText('Solo puedes quitar a Bea Prueba cuando su saldo esté a cero.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Quitar/ })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Cerrar', exact: true }).last()).toBeFocused()
  await sheet.getByRole('button', { name: 'Ver cómo saldar' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('tab', { name: 'Saldos' })).toHaveAttribute('aria-selected', 'true')

  // Carla salda su parte; Ana ya puede quitarla.
  await pay(carla, id, 'Ana Prueba')
  await page.goto(`/grupos/${id}?seccion=miembros`)
  await page.getByRole('button', { name: /Carla Prueba/ }).click()
  sheet = page.getByRole('dialog', { name: 'Carla Prueba' })
  await expect(sheet.getByText('En paz')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await sheet.getByRole('button', { name: 'Quitar a Carla Prueba del grupo' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Has quitado a Carla Prueba del grupo.' })).toBeVisible()
  await expect(page.getByText('2 miembros · Euro (€)')).toBeVisible()
  await expect(row(page, 'Carla Prueba')).toContainText('Ya no está')
  await expect(page.getByRole('button', { name: /Carla Prueba/ })).toHaveCount(0)

  // Su gasto y su pago quedan en la lista, de solo lectura.
  await page.getByRole('tab', { name: 'Gastos' }).click()
  await expect(row(page, 'Pago a ti')).toContainText('Pagó Carla Prueba · ya no está')
  await row(page, 'Cena').click()
  await expect(page.getByText('Carla Prueba ya no está en el grupo, así que este gasto ya no se puede editar ni borrar.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0)
  await page.goto(`/grupos/${id}/gastos/${page.url().split('/').pop()}/editar`)
  await expect(page.getByRole('heading', { name: 'Este gasto ya no se puede editar' })).toBeVisible()

  // Actividad: «Tú quitaste a Carla Prueba del grupo»; Bea lo ve en tercera persona.
  await page.goto(`/grupos/${id}?seccion=actividad`)
  await expect(page.getByText('quitaste a Carla Prueba del grupo')).toBeVisible()
  await bea.goto(`/grupos/${id}?seccion=actividad`)
  await expect(bea.getByText('quitó a Carla Prueba del grupo')).toBeVisible()

  // Carla ya no ve el grupo ni puede volver con el enlace.
  await carla.goto(`/grupos/${id}`)
  await expect(carla.getByRole('heading', { name: 'No encontramos este grupo' })).toBeVisible()
  await carla.goto(`/unirse/${code}`)
  await expect(carla.getByRole('heading', { name: 'Ya no formas parte de este grupo' })).toBeVisible()
  await expect(carla.getByRole('button', { name: 'Unirme al grupo' })).toHaveCount(0)

  // Borrar el grupo: bloqueado mientras Bea deba algo.
  await page.goto(`/grupos/${id}?seccion=miembros`)
  await page.getByRole('button', { name: 'Borrar grupo…' }).click()
  sheet = page.getByRole('dialog', { name: `¿Borrar ${name}?` })
  await expect(sheet.getByText('Aún hay saldos pendientes')).toBeVisible()
  await expect(sheet.getByRole('listitem').filter({ hasText: 'Bea Prueba' })).toContainText('Debe 10,00 €')
  await expect(sheet.getByRole('button', { name: 'Borrar grupo' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await expect(sheet).toBeHidden()

  // Bea salda; Ana borra el grupo y vuelve a Grupos con el aviso.
  await pay(bea, id, 'Ana Prueba')
  await page.goto(`/grupos/${id}?seccion=miembros`)
  await page.getByRole('button', { name: 'Borrar grupo…' }).click()
  await expect(sheet.getByText('Todos están en paz')).toBeVisible()
  await expect(sheet.getByText('El grupo, sus gastos y sus pagos desaparecerán para los 2 miembros. No se puede deshacer.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Borrar grupo' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('status').filter({ hasText: `Grupo borrado: «${name}».` })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)
  await bea.goto(`/grupos/${id}`)
  await expect(bea.getByRole('heading', { name: 'No encontramos este grupo' })).toBeVisible()

  await context.close()
  await carlaContext.close()
})
