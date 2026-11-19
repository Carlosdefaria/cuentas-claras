// Pruebas de extremo a extremo (WebKit primero: iOS es la prioridad) contra `npm run dev`,
// que usa la rama `test` de Neon. En el contenedor cloud: npm run test:e2e (ya fija el proxy).
import { defineConfig, devices } from '@playwright/test'

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
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'] } },
    { name: 'chromium-android', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
