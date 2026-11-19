// Tests contra la rama `test` de Neon: npm run test:db
// Separados de `npm test` (dominio puro, sin red).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['db/tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
