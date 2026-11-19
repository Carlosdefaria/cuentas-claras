// Aplica las migraciones de db/migrations/*.sql en la rama `test` de Neon.
//
//   npm run db:migrate
//
// - Registra cada migración aplicada en app_migrations.applied (nombre + checksum SHA-256)
//   y no la vuelve a ejecutar.
// - Si una migración ya aplicada ha cambiado en disco, aborta (las migraciones no se editan:
//   se crea una nueva).
// - Cada migración se aplica en una única transacción junto con su registro.
//   Las sentencias se separan con el parser real de Postgres (libpg-query), así que los
//   cuerpos $$...$$ de las funciones no se rompen. BEGIN/COMMIT del fichero se ignoran
//   porque la transacción la gestiona este script.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pgQuery from 'libpg-query'
import { testSql } from './testDb.ts'

const MIGRATIONS_DIR = 'db/migrations'

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

async function main() {
  const sql = testSql()

  await sql.transaction([
    sql.query('create schema if not exists app_migrations'),
    sql.query('revoke all on schema app_migrations from public'),
    sql.query(`create table if not exists app_migrations.applied (
      name       text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )`),
  ])

  const applied = new Map<string, string>()
  for (const row of await sql.query('select name, checksum from app_migrations.applied')) {
    applied.set(row.name as string, row.checksum as string)
  }

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  let count = 0

  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const checksum = createHash('sha256').update(text).digest('hex')
    const previous = applied.get(file)

    if (previous === checksum) {
      console.log(`= ${file} (ya aplicada)`)
      continue
    }
    if (previous) {
      throw new Error(`${file} ya se aplicó pero ha cambiado en disco. Crea una migración nueva.`)
    }

    const statements = await splitStatements(text)
    await sql.transaction([
      ...statements.map((s) => sql.query(s)),
      sql.query('insert into app_migrations.applied (name, checksum) values ($1, $2)', [file, checksum]),
    ])
    console.log(`+ ${file} (${statements.length} sentencias)`)
    count++
  }

  console.log(count === 0 ? 'Nada que aplicar.' : `Aplicadas ${count} migraciones en la rama test.`)
}

main().catch((err) => {
  console.error('Error en la migración:', err instanceof Error ? err.message : err)
  process.exit(1)
})
