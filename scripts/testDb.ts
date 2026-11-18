// Conexión a la rama `test` de Neon para migraciones y tests de BD.
//
// Barreras para no tocar nunca production:
//   1. Solo se lee `.env.test.local` (nunca process.env ni `.env.local`).
//   2. NEON_BRANCH de ese fichero tiene que ser exactamente "test".
//   3. El host de la BD de test tiene que ser distinto del de `.env.local` (production).
//
// Se usa el driver HTTP de Neon contra el host del endpoint de test (el contenedor cloud
// solo permite HTTPS saliente). Ejecutar con NODE_USE_ENV_PROXY=1 en el contenedor.

import { readFileSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { neon, neonConfig } from '@neondatabase/serverless'

function readEnvFile(path: string): Record<string, string | undefined> {
  return parseEnv(readFileSync(path, 'utf8')) as Record<string, string | undefined>
}

function hostOf(url: string): string {
  return new URL(url).hostname
}

export function testDatabaseUrl(): string {
  if (!existsSync('.env.test.local')) {
    throw new Error('Falta .env.test.local (neon env pull --branch test --file .env.test.local)')
  }
  const env = readEnvFile('.env.test.local')
  if (env.NEON_BRANCH !== 'test') {
    throw new Error(`Abortado: .env.test.local apunta a la rama "${env.NEON_BRANCH}", no a "test"`)
  }
  const url = env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL en .env.test.local')

  if (existsSync('.env.local')) {
    const prodUrl = readEnvFile('.env.local').DATABASE_URL
    if (prodUrl && hostOf(prodUrl) === hostOf(url)) {
      throw new Error('Abortado: la URL de test coincide con la de production (.env.local)')
    }
  }
  return url
}

/** Cliente SQL (HTTP) contra la rama test. */
export function testSql() {
  const url = testDatabaseUrl()
  const host = hostOf(url)
  neonConfig.fetchEndpoint = () => `https://${host}/sql`
  return neon(url)
}
