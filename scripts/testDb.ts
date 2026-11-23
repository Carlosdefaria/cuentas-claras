// Conexión a una rama de PRUEBA de Neon para migraciones y tests de BD: `test` (por defecto) o una rama de comprobación
// cuyo nombre empiece por `baseline-` (p. ej. la rama creada desde production para probar db/baseline.sql).
//
//   DB_ENV=.env.baseline.local npm run test:db     # otra rama de prueba (por defecto, .env.test.local)
//
// Barreras para no tocar nunca production:
//   1. Solo se lee el fichero de DB_ENV o `.env.test.local` (nunca DATABASE_URL de process.env ni `.env.local`), y su
//      nombre tiene que ser `.env.test.local` o `.env.baseline*.local`.
//   2. NEON_BRANCH de ese fichero tiene que ser "test" o empezar por "baseline-" (nunca "production").
//   3. El host de la BD tiene que ser distinto del de `.env.local` (production), si existe.
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

/** Fichero de entorno de la rama de prueba: DB_ENV o `.env.test.local`. */
export function testEnvFile(): string {
  const file = process.env.DB_ENV || '.env.test.local'
  if (file !== '.env.test.local' && !/^\.env\.baseline[\w-]*\.local$/.test(file)) {
    throw new Error(`Abortado: DB_ENV="${file}" no es .env.test.local ni .env.baseline*.local`)
  }
  return file
}

/** Variables de la rama de prueba, ya comprobadas (rama `test` o `baseline-*`). */
export function testEnv(): Record<string, string | undefined> {
  const file = testEnvFile()
  if (!existsSync(file)) {
    throw new Error(`Falta ${file} (p. ej. neon env pull --branch test --file .env.test.local)`)
  }
  const env = readEnvFile(file)
  const branch = env.NEON_BRANCH ?? ''
  if (branch !== 'test' && !branch.startsWith('baseline-')) {
    throw new Error(`Abortado: ${file} apunta a la rama "${branch}"; solo se admite "test" o "baseline-*"`)
  }
  return env
}

export function testDatabaseUrl(): string {
  const env = testEnv()
  const url = env.DATABASE_URL
  if (!url) throw new Error(`Falta DATABASE_URL en ${testEnvFile()}`)

  if (existsSync('.env.local')) {
    const prodUrl = readEnvFile('.env.local').DATABASE_URL
    if (prodUrl && hostOf(prodUrl) === hostOf(url)) {
      throw new Error('Abortado: la URL de test coincide con la de production (.env.local)')
    }
  }
  return url
}

/** Cliente SQL (HTTP) contra la rama de prueba. */
export function testSql() {
  const url = testDatabaseUrl()
  const host = hostOf(url)
  neonConfig.fetchEndpoint = () => `https://${host}/sql`
  return neon(url)
}
