// Aplica el esquema en una rama de prueba de Neon (`test`, o `baseline-*` con DB_ENV; ver scripts/testDb.ts).

//   npm run db:migrate
//   DB_ENV=.env.baseline.local npm run db:migrate
//   npm run db:migrate -- --dry-run      # solo dice lo que haría

// La lógica (línea base + db/migrations/0010…) está en scripts/migrations.ts. Production tiene su propio comando con
// barreras: scripts/migrateProduction.ts.


import { migrate } from './migrations.ts'
import { testEnv, testSql } from './testDb.ts'

migrate(testSql(), { apply: !process.argv.includes('--dry-run'), label: testEnv().NEON_BRANCH ?? '?' }).catch((err) => {
  console.error('Error en la migración:', err instanceof Error ? err.message : err)
  process.exit(1)
})
