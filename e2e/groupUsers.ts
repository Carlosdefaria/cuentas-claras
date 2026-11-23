// Usuarios y grupos de prueba para los e2e de gastos (rama test). Cada spec lleva su lista de emails creados y la
// borra al final con cleanupUsers: primero los grupos (en cascada gastos, cuotas, miembros y actividad), luego usuarios.
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import { testSql } from '../scripts/testDb.ts'
import { markVerified } from './otp.ts'

const PASSWORD = 'Prueba-E2E-1234'

export async function cleanupUsers(created: string[]) {
  if (created.length === 0) return
  const sql = testSql()
  await sql.query(`delete from public.groups where created_by in (select id from neon_auth."user" where email = any($1::text[]))`, [created])
  await sql.query(`delete from neon_auth."user" where email = any($1::text[])`, [created])
}

export async function signedInUser(page: Page, name: string, info: TestInfo, created: string[], prefix = 'exp') {
  const email = `e2e-${prefix}-${name.toLowerCase().split(' ')[0]}-${info.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cuentas-claras.test`
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
export async function groupOfTwo(page: Page, browser: Browser, info: TestInfo, groupName: string, created: string[], prefix = 'exp') {
  await signedInUser(page, 'Ana Prueba', info, created, prefix)
  await page.getByRole('link', { name: 'Nuevo grupo' }).click()
  await page.getByLabel('Nombre del grupo').fill(groupName)
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  const sheet = page.getByRole('dialog')
  const link = await sheet.getByLabel('Enlace de invitación').inputValue()
  await sheet.getByRole('button', { name: 'Cerrar' }).click()
  const id = page.url().split('/').pop()!.split('?')[0]

  const context = await browser.newContext({ ...info.project.use, baseURL: 'https://localhost:5173', ignoreHTTPSErrors: true })
  const bea = await context.newPage()
  await signedInUser(bea, 'Bea Prueba', info, created, prefix)
  await bea.goto(link)
  await bea.getByRole('button', { name: 'Unirme al grupo' }).click()
  await expect(bea).toHaveURL(`/grupos/${id}`)
  return { bea, context, id }
}

export const row = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text })
