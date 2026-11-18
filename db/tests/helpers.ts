// Utilidades para tests contra la rama `test` de Neon (nunca production: ver scripts/testDb.ts).

import type { NeonQueryPromise } from '@neondatabase/serverless'
import { testSql } from '../../scripts/testDb.ts'

export const sql = testSql()

/** Dominio reservado para usuarios sintéticos de test (no recibe correo). */
export const TEST_EMAIL_DOMAIN = 'cuentas-claras.test'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = NeonQueryPromise<false, false, any>

/**
 * Asegura que existen usuarios sintéticos en neon_auth."user" y devuelve { nombre: id }.
 * Se insertan directamente (como neondb_owner) porque los tests simulan el JWT; estos
 * usuarios no tienen contraseña y no pueden iniciar sesión en la app.
 */
export async function ensureUsers(names: string[]): Promise<Record<string, string>> {
  const emails = names.map((n) => `${n}@${TEST_EMAIL_DOMAIN}`)
  await sql.query(
    `insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     select gen_random_uuid(), split_part(e, '@', 1), e, true, now(), now()
     from unnest($1::text[]) as e
     on conflict (email) do nothing`,
    [emails],
  )
  const rows = await sql.query(`select id, email from neon_auth."user" where email = any($1::text[])`, [emails])
  return Object.fromEntries(rows.map((r) => [String(r.email).split('@')[0], String(r.id)]))
}

/**
 * Ejecuta consultas como el rol `authenticated` (igual que la Data API) dentro de una
 * transacción. Con `userId` simula el claim `sub` del JWT; con `null` no hay sesión.
 * Devuelve solo los resultados de `build`.
 */
export async function asUser(userId: string | null, build: () => Query[]) {
  const prelude: Query[] = [loadSessionJwt(), sql.query('set local role authenticated')]
  if (userId) {
    prelude.push(
      sql.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]),
    )
  }
  const results = await sql.transaction([...prelude, ...build()])
  return results.slice(prelude.length)
}

/** Igual que asUser pero con el rol `anonymous` (peticiones sin token a la Data API). */
export async function asAnonymous(build: () => Query[]) {
  const results = await sql.transaction([loadSessionJwt(), sql.query('set local role anonymous'), ...build()])
  return results.slice(2)
}

/**
 * Fuerza la carga de pg_session_jwt en la conexión ANTES de simular el JWT.
 *
 * La extensión no está en shared_preload_libraries: se carga en cada conexión nueva del
 * servidor la primera vez que se llama a auth.*. Si en ese momento request.jwt.claims ya lo
 * había fijado el rol `authenticated`, ese valor se pierde y auth.uid() devuelve NULL en esa
 * primera transacción (reproducido tras suspender la rama: solo falla la 1.ª transacción de
 * cada conexión nueva). Llamar a auth.uid() como neondb_owner al principio lo evita.
 */
function loadSessionJwt(): Query {
  return sql.query('select auth.uid()')
}

/** Primera fila de la primera consulta ejecutada como `userId`. */
export async function one(userId: string | null, text: string, params: unknown[] = []) {
  const [rows] = await asUser(userId, () => [sql.query(text, params)])
  return rows[0]
}
