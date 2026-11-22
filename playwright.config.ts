// Pruebas de extremo a extremo (WebKit primero: iOS es la prioridad) contra `npm run dev`,
// que usa la rama `test` de Neon. En el contenedor cloud: npm run test:e2e (ya fija el proxy).
import { defineConfig, devices } from '@playwright/test'

const PREVIEW = 'https://localhost:4173'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    trace: 'off',
  },
  projects: [
    { name: 'webkit-iphone', testIgnore: /pwa\.spec/, use: { ...devices['iPhone 15'] } },
    { name: 'chromium-android', testIgnore: /pwa\.spec/, use: { ...devices['Pixel 7'] } },
    // PWA (manifest, service worker, sin conexión): contra el build servido con `vite preview`.
    { name: 'pwa-webkit-iphone', testMatch: /pwa\.spec/, use: { ...devices['iPhone 15'], baseURL: PREVIEW } },
    {
      name: 'pwa-chromium-android',
      testMatch: /pwa\.spec/,
      // Chromium no registra service workers con un certificado autofirmado aunque se ignoren los errores
      // de HTTPS en el contexto: hace falta la opción de arranque.
      use: { ...devices['Pixel 7'], baseURL: PREVIEW, launchOptions: { args: ['--ignore-certificate-errors'] } },
    },
  ],
  webServer: [
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'https://localhost:5173',
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: PREVIEW,
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
