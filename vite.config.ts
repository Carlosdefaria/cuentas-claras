/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { serwist } from '@serwist/vite'
import { defineConfig, loadEnv } from 'vite'
import { authProxyDev } from './server/viteAuthProxy.ts'
import { preloadFonts } from './build/preloadFonts.ts'

// https://vite.dev/config/
export default defineConfig(({ command, mode, isPreview }) => {
  // Variables sin prefijo VITE_ (solo para el proxy de desarrollo; nunca llegan al navegador).
  // `vite preview` (pruebas de la PWA en local) usa también .env.development.local (rama test).
  const env = loadEnv(isPreview ? 'development' : mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      preloadFonts([/barlow-condensed-latin-700-normal-[\w-]+\.woff2$/]),
      // HTTPS en desarrollo: Safari/WebKit solo guarda cookies Secure en contexto seguro.
      basicSsl(),
      authProxyDev({
        NEON_AUTH_BASE_URL: env.NEON_AUTH_BASE_URL,
        NEON_AUTH_COOKIE_SECRET: env.NEON_AUTH_COOKIE_SECRET,
      }),
      // Service worker (solo en el build: en `npm run dev` no hay SW que cachee código a medio hacer).
      serwist({
        swSrc: 'src/sw/sw.ts',
        swDest: 'sw.js',
        swUrl: '/sw.js',
        globDirectory: 'dist',
        // Armazón de la app. Nada de /api ni datos: esos no son ficheros del build.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        globIgnores: ['sw.js'],
        injectionPoint: 'self.__SW_MANIFEST',
        rollupFormat: 'iife',
        disable: command === 'serve' && !isPreview,
      }),
    ],
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
    },
  }
})
