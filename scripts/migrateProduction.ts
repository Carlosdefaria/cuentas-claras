// Aplica el esquema en PRODUCTION (línea base + db/migrations/0010…), con las barreras de scripts/productionDb.ts.
// Antes, ensayar lo mismo en una rama `baseline-*` creada desde production (ver CLAUDE.md). Tras aplicar, refrescar la
// caché de la Data API de production.
//
//   CONFIRM_PRODUCTION=floral-shape-78727958/production npm run db:migrate:production            # en seco: no escribe
//   CONFIRM_PRODUCTION=floral-shape-78727958/production npm run db:migrate:production -- --apply # aplica

import { migrate } from './migrations.ts'
import { productionSql } from './productionDb.ts'

const apply = process.argv.includes('--apply')
console.log(apply ? '⚠ PRODUCTION: se va a APLICAR el esquema.' : 'PRODUCTION · ejecución en seco (sin --apply no se escribe nada).')

Promise.resolve()
  .then(() => migrate(productionSql(), { apply, label: 'production' }))
  .catch((err) => {
    console.error('Error en la migración de production:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
