/// <reference lib="dom" />
// PWA instalable: manifest e iconos, service worker sin datos de usuario en caché, arranque sin conexión
// y ayuda de instalación en iOS. Corre contra el build (`vite preview`), que es lo único con service worker.
import { expect, test, type Page } from '@playwright/test'

/** Ancho y alto de un PNG (cabecera IHDR). */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

async function controlledBySw(page: Page) {
  await page.goto('/entrar')
  await page.evaluate(() => navigator.serviceWorker.ready)
  // Sin clientsClaim: la primera carga no queda controlada; tras recargar, sí.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

test('manifest instalable con iconos 192/512, maskable y apple-touch-icon', async ({ page, request }) => {
  await page.goto('/entrar')
  const head = page.locator('head')
  await expect(head.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
  await expect(head.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0d5637')
  await expect(head.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')

  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest).toMatchObject({
    name: 'Cuentas Claras',
    short_name: 'Cuentas',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    lang: 'es',
    theme_color: '#0d5637',
    background_color: '#e9f2ed',
  })
  const icons = manifest.icons as { src: string; sizes: string; purpose: string }[]
  for (const want of ['192x192 any', '512x512 any', '512x512 maskable']) {
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`)).toContain(want)
  }
  for (const icon of icons) {
    const png = await request.get(icon.src)
    expect(png.ok(), icon.src).toBe(true)
    const { width, height } = pngSize(await png.body())
    expect(`${width}x${height}`).toBe(icon.sizes)
  }
  expect(pngSize(await (await request.get('/apple-touch-icon.png')).body())).toEqual({ width: 180, height: 180 })
})

test.describe('service worker', () => {
  test('precachea solo el armazón: nada de /api ni de la Data API en Cache Storage', async ({ page }) => {
    await controlledBySw(page)
    // Más tráfico de Auth con el SW ya controlando (get-session pasa por /api/auth).
    await page.reload()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    const cached = await page.evaluate(async () => {
      const urls: string[] = []
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(req.url)
      }
      return urls
    })
    expect(cached.some((u) => u.endsWith('/index.html') || u.includes('/index.html?'))).toBe(true)
    const origin = new URL(page.url()).origin
    for (const url of cached) {
      expect(new URL(url).origin, url).toBe(origin)
      expect(new URL(url).pathname.startsWith('/api'), url).toBe(false)
    }
  })

  test('sin conexión la app abre, avisa y no muestra datos de caché', async ({ page, context, browserName }) => {
    // En WebKit, recargar con context.setOffline(true) da «internal error» en Playwright: se prueba en
    // Chromium y en el iPhone real (docs/pruebas-pwa.md §5).
    test.skip(browserName === 'webkit', 'Playwright WebKit no recarga con setOffline')
    await controlledBySw(page)
    await context.setOffline(true)
    try {
      await page.reload()
      await expect(page.getByText('Sin conexión.')).toBeVisible()
      await expect(page.getByText('Cuentas Claras', { exact: true }).first()).toBeVisible()
      // La sesión no se puede comprobar sin red: se dice, con opción de reintentar (no hay datos guardados).
      await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
    } finally {
      await context.setOffline(false)
    }
    await expect(page.getByText('Sin conexión.')).toBeHidden()
  })
})

test('ayuda de instalación: en iPhone se muestra y se puede ocultar; en Android no', async ({ page, browserName }) => {
  await page.goto('/entrar')
  const help = page.getByRole('region', { name: 'Instálala en tu iPhone' })
  if (browserName !== 'webkit') {
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(help).toHaveCount(0)
    return
  }
  await expect(help).toBeVisible()
  await expect(help.getByText('Elige «Añadir a pantalla de inicio»')).toBeVisible()
  await help.getByRole('button', { name: 'Ocultar la ayuda para instalar' }).click()
  await expect(help).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  await expect(help).toHaveCount(0)
})
