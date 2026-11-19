/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv } from 'vite'
import { authProxyDev } from './server/viteAuthProxy.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Variables sin prefijo VITE_ (solo para el proxy de desarrollo; nunca llegan al navegador).
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      // HTTPS en desarrollo: Safari/WebKit solo guarda cookies Secure en contexto seguro.
      basicSsl(),
      authProxyDev({
        NEON_AUTH_BASE_URL: env.NEON_AUTH_BASE_URL,
        NEON_AUTH_COOKIE_SECRET: env.NEON_AUTH_COOKIE_SECRET,
      }),
    ],
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    },
  }
})
