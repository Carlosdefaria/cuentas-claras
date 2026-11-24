/// <reference lib="dom" />
// Mantener pulsado en la app instalada (PWA standalone): enlaces y botones sin vista previa de enlaces de iOS ni selección
// de texto; los campos siguen siendo seleccionables. En el navegador (Safari), todo como en una web normal.
// La vista previa solo existe en un iPhone real: aquí se comprueban los estilos que la desactivan.
import { expect, test, type Page } from '@playwright/test'

const styleOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitUserSelect?: string; webkitTouchCallout?: string }
    return { select: s.userSelect || s.webkitUserSelect, callout: s.webkitTouchCallout ?? null }
  })

test('app instalada: enlaces y botones sin vista previa ni selección; en el navegador, normal', async ({ page }) => {
  // Navegador: nada cambia.
  await page.goto('/entrar')
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  expect(await page.locator('html').getAttribute('data-app-instalada')).toBeNull()
  expect((await styleOf(page, 'main a')).select).not.toBe('none')

  // App instalada (como iOS: navigator.standalone).
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  expect(await page.locator('html').getAttribute('data-app-instalada')).toBe('')
  for (const selector of ['main a', 'main button[type="submit"]']) {
    const style = await styleOf(page, selector)
    expect(style.select).toBe('none')
    if (style.callout !== null && style.callout !== undefined && style.callout !== '') expect(style.callout).toBe('none')
  }
  expect((await styleOf(page, 'input[type="email"]')).select).not.toBe('none')
})
