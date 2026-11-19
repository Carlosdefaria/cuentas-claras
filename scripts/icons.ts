// Genera los PNG de la PWA a partir de los SVG fuente de design/icon/ (procedencia de cada imagen).
// Renderiza con el Chromium de Playwright y Barlow Condensed autoalojada (@fontsource), sin dependencias nuevas.
//   npm run icons
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const font = readFileSync(
  resolve(root, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2'),
).toString('base64')

const outputs: { src: string; out: string; size: number }[] = [
  { src: 'design/icon/icon.svg', out: 'public/icons/icon-192.png', size: 192 },
  { src: 'design/icon/icon.svg', out: 'public/icons/icon-512.png', size: 512 },
  { src: 'design/icon/icon-maskable.svg', out: 'public/icons/icon-maskable-512.png', size: 512 },
  // iOS: 180×180, opaco (iOS redondea las esquinas). En la raíz porque iOS también la busca ahí.
  { src: 'design/icon/icon.svg', out: 'public/apple-touch-icon.png', size: 180 },
  { src: 'public/favicon.svg', out: 'public/icons/favicon-48.png', size: 48 },
]

mkdirSync(resolve(root, 'public/icons'), { recursive: true })
const browser = await chromium.launch()
try {
  for (const { src, out, size } of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    const svg = readFileSync(resolve(root, src), 'utf8')
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      @font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url(data:font/woff2;base64,${font}) format("woff2"); }
      html, body { margin: 0; background: transparent; } svg { display: block; width: ${size}px; height: ${size}px; }
    </style>${svg}`)
    await page.evaluate(async () => {
      await document.fonts.load('700 10px "Barlow Condensed"')
      await document.fonts.ready
    })
    await page.screenshot({ path: resolve(root, out), omitBackground: out.includes('favicon') })
    await page.close()
    console.log(`${out} (${size}×${size}) ← ${src}`)
  }
} finally {
  await browser.close()
}
