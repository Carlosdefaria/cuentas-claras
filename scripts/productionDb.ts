// Conexión a la rama `production` de Neon, SOLO para scripts/migrateProduction.ts. Barreras (todas obligatorias):
//   1. Solo se lee `.env.local` (lo genera `neon env pull --branch production --file .env.local`); nunca process.env.
//   2. NEON_BRANCH tiene que ser exactamente "production" y el proyecto de `.neon`, el de Cuentas Claras.
//   3. Confirmación escrita: CONFIRM_PRODUCTION=floral-shape-78727958/production.
//   4. El host de la BD tiene que ser distinto del de `.env.test.local` (rama test), si existe.
// Sin `--apply`, migrateProduction solo dice lo que haría.

import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { neon, neonConfig } from '@neondatabase/serverless'

export const PRODUCTION_PROJECT = 'floral-shape-78727958'
export const CONFIRMATION = `${PRODUCTION_PROJECT}/production`

type Env = Record<string, string | undefined>

/** Comprueba las barreras y devuelve la URL de la BD de production. Pura (se prueba sin red). */
export function checkProductionTarget({ env, projectId, confirm, testUrl }: { env: Env | null; projectId: string | undefined; confirm: string | undefined; testUrl?: string }): string {
  if (!env) throw new Error('Falta .env.local (neon env pull --branch production --file .env.local)')
  if (env.NEON_BRANCH !== 'production') throw new Error(`Abortado: .env.local apunta a la rama "${env.NEON_BRANCH}", no a "production"`)
  if (projectId !== PRODUCTION_PROJECT) throw new Error(`Abortado: .neon apunta al proyecto "${projectId}", no a ${PRODUCTION_PROJECT}`)
  if (confirm !== CONFIRMATION) throw new Error(`Abortado: falta la confirmación CONFIRM_PRODUCTION=${CONFIRMATION}`)
  const url = env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL en .env.local')
  if (testUrl && new URL(testUrl).hostname === new URL(url).hostname) throw new Error('Abortado: la URL de production coincide con la de test')
  return url
}

const readEnv = (path: string): Env | null => (existsSync(path) ? (parseEnv(readFileSync(path, 'utf8')) as Env) : null)

/** Cliente SQL (HTTP) contra production, tras comprobar las barreras. */
export function productionSql() {
  const url = checkProductionTarget({
    env: readEnv('.env.local'),
    projectId: existsSync('.neon') ? (JSON.parse(readFileSync('.neon', 'utf8')) as { projectId?: string }).projectId : undefined,
    confirm: process.env.CONFIRM_PRODUCTION,
    testUrl: readEnv('.env.test.local')?.DATABASE_URL,
  })
  const host = new URL(url).hostname
  neonConfig.fetchEndpoint = () => `https://${host}/sql`
  return neon(url)
}
