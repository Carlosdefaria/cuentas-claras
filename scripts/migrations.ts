// Lógica común para aplicar el esquema (línea base + migraciones posteriores) en una base de Neon.
// La usan scripts/migrate.ts (ramas de prueba) y scripts/migrateProduction.ts (production, con barreras).
//
// - Línea base (db/baseline.sql = 0001–0009 consolidadas; historial en db/migrations-legacy/):
//   base sin historial ni tablas → se aplica y se anota como `baseline.sql`; base con 0001–0009 ya anotadas (la rama
//   `test`) → solo se anota; historial parcial, o tablas sin historial → aborta.
// - Después, db/migrations/*.sql (0010 en adelante), en orden, cada una en una única transacción con su registro en
//   app_migrations.applied (nombre + checksum SHA-256). Una migración aplicada que ha cambiado en disco → aborta.
// - Con `apply: false` solo se calcula y se cuenta lo que se haría: no se escribe NADA (ni el esquema de registro).
// - Las sentencias se separan con el parser real de Postgres (libpg-query): los cuerpos $$...$$ no se rompen.
//   BEGIN/COMMIT de los ficheros se ignoran porque la transacción la gestiona este código.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pgQuery from 'libpg-query'

const MIGRATIONS_DIR = 'db/migrations'
const LEGACY_DIR = 'db/migrations-legacy'
const BASELINE = 'db/baseline.sql'
const BASELINE_NAME = 'baseline.sql'

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const sqlFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

interface RawStmt {
  stmt: Record<string, unknown>
  stmt_location?: number
  stmt_len?: number
}

async function splitStatements(sqlText: string): Promise<string[]> {
  await pgQuery.loadModule()
  const { stmts } = (await pgQuery.parse(sqlText)) as { stmts: RawStmt[] }
  const bytes = Buffer.from(sqlText, 'utf8') // las posiciones del parser son en bytes
  return stmts
    .filter((s) => !('TransactionStmt' in s.stmt))
    .map((s) => {
      const start = s.stmt_location ?? 0
      const end = s.stmt_len ? start + s.stmt_len : bytes.length
      return bytes.subarray(start, end).toString('utf8').trim()
    })
    .filter((s) => s.length > 0)
}

type Sql = import('@neondatabase/serverless').NeonQueryFunction<false, false>

export async function migrate(sql: Sql, { apply, label }: { apply: boolean; label: string }): Promise<number> {
  const [{ registry }] = await sql.query(`select to_regclass('app_migrations.applied') is not null as registry`)
  if (apply) {
    await sql.transaction([
      sql.query('create schema if not exists app_migrations'),
      sql.query('revoke all on schema app_migrations from public'),
      sql.query(`create table if not exists app_migrations.applied (
        name       text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )`),
    ])
  }

  const applied = new Map<string, string>()
  if (registry || apply) {
    for (const row of await sql.query('select name, checksum from app_migrations.applied')) {
      applied.set(row.name as string, row.checksum as string)
    }
  }

  const would = (what: string) => console.log(`${apply ? '+' : '→ haría:'} ${what}`)
  let count = 0

  // 1. Línea base.
  const baselineText = readFileSync(BASELINE, 'utf8')
  const baselineSum = sha256(baselineText)
  const previousBaseline = applied.get(BASELINE_NAME)
  if (previousBaseline && previousBaseline !== baselineSum) {
    throw new Error(`${BASELINE_NAME} ya está anotada pero ha cambiado en disco. No se edita: crea una migración nueva.`)
  }
  if (!previousBaseline) {
    const legacy = sqlFiles(LEGACY_DIR)
    const legacyDone = legacy.filter((f) => applied.has(f))
    if (legacyDone.length === legacy.length) {
      if (apply) await sql.query('insert into app_migrations.applied (name, checksum) values ($1, $2)', [BASELINE_NAME, baselineSum])
      console.log(`= ${BASELINE_NAME} (la base ya tiene 0001–0009: ${apply ? 'anotada' : 'solo se anotaría'})`)
    } else if (legacyDone.length > 0) {
      throw new Error(`Historial parcial (${legacyDone.join(', ')}): no se puede aplicar la línea base encima.`)
    } else {
      const [{ exists }] = await sql.query(`select to_regclass('public.groups') is not null as exists`)
      if (exists) throw new Error('La base tiene tablas pero no historial de migraciones: revisa antes de aplicar nada.')
      const statements = await splitStatements(baselineText)
      if (apply) {
        await sql.transaction([
          ...statements.map((s) => sql.query(s)),
          sql.query('insert into app_migrations.applied (name, checksum) values ($1, $2)', [BASELINE_NAME, baselineSum]),
        ])
      }
      would(`${BASELINE_NAME} (${statements.length} sentencias)`)
      count++
    }
  } else {
    console.log(`= ${BASELINE_NAME} (ya aplicada)`)
  }

  // 2. Migraciones posteriores a la línea base.
  for (const file of sqlFiles(MIGRATIONS_DIR)) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const checksum = sha256(text)
    const previous = applied.get(file)
    if (previous === checksum) {
      console.log(`= ${file} (ya aplicada)`)
      continue
    }
    if (previous) throw new Error(`${file} ya se aplicó pero ha cambiado en disco. Crea una migración nueva.`)
    const statements = await splitStatements(text)
    if (apply) {
      await sql.transaction([
        ...statements.map((s) => sql.query(s)),
        sql.query('insert into app_migrations.applied (name, checksum) values ($1, $2)', [file, checksum]),
      ])
    }
    would(`${file} (${statements.length} sentencias)`)
    count++
  }

  if (count === 0) console.log(`Nada que aplicar en la rama ${label}.`)
  else console.log(apply ? `Aplicadas ${count} migraciones en la rama ${label}.` : `Se aplicarían ${count} migraciones en la rama ${label} (ejecución en seco: no se ha escrito nada).`)
  return count
}
