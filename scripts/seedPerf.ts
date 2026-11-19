// Siembra datos sintéticos de rendimiento en la rama `test` y mide la lectura de
// expense_shares con RLS (como el rol authenticated de la Data API).
//
//   npm run db:perf
//
// Grupo "perf-50x5000": 50 miembros sintéticos y 5.000 gastos con cuotas de reparto igual
// (cada gasto entre el pagador y ~la mitad del grupo; resto determinista por user_id).
// Es idempotente: si el grupo ya tiene 5.000 gastos, no vuelve a sembrar.

import { testSql } from './testDb.ts'

const GROUP = 'perf-50x5000'
const MEMBERS = 50
const EXPENSES = 5000
const DOMAIN = 'cuentas-claras.test'
const LIMIT_MS = 200

const sql = testSql()

async function seed(): Promise<string> {
  const emails = Array.from({ length: MEMBERS }, (_, i) => `perf-${String(i + 1).padStart(2, '0')}@${DOMAIN}`)
  await sql.query(
    `insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     select gen_random_uuid(), split_part(e, '@', 1), e, true, now(), now()
     from unnest($1::text[]) as e
     on conflict (email) do nothing`,
    [emails],
  )

  const existing = await sql.query(
    `select g.id, (select count(*) from public.expenses e where e.group_id = g.id)::int as n
     from public.groups g where g.name = $1 and g.deleted_at is null`,
    [GROUP],
  )
  if (existing[0]?.n === EXPENSES) {
    console.log(`= Grupo ${GROUP} ya sembrado (${EXPENSES} gastos)`)
    return existing[0].id as string
  }
  if (existing.length > 0) await sql.query(`delete from public.groups where name = $1`, [GROUP])

  // Todo como neondb_owner (BYPASSRLS) en una sola transacción.
  const [, groupRows] = await sql.transaction([
    sql.query(`select setseed(0.42)`),
    sql.query(
      `insert into public.groups (name, created_by)
       select $1, id from neon_auth."user" where email = $2
       returning id`,
      [GROUP, emails[0]],
    ),
  ])
  const groupId = groupRows[0].id as string

  await sql.transaction([
    sql.query(`select setseed(0.42)`),
    sql.query(
      `insert into public.memberships (group_id, user_id, role)
       select $1, u.id, case when u.email = $2 then 'admin' else 'member' end
       from neon_auth."user" u where u.email = any($3::text[])`,
      [groupId, emails[0], emails],
    ),
    sql.query(
      `with members as (
         select array_agg(user_id order by user_id::text) as ids
         from public.memberships where group_id = $1
       ),
       new_expenses as (
         insert into public.expenses (group_id, description, amount_cents, paid_by, created_by, expense_date)
         select $1, 'Gasto sintético ' || i, 1 + floor(random() * 50000)::int,
                m.ids[1 + (i % $2)], m.ids[1 + (i % $2)], current_date - (i % 365)
         from members m, generate_series(1, $3) as i
         returning id, amount_cents, paid_by
       ),
       participants as (
         select e.id as expense_id, e.amount_cents, ms.user_id,
                row_number() over (partition by e.id order by ms.user_id::text) as rn,
                count(*) over (partition by e.id) as n
         from new_expenses e
         join public.memberships ms on ms.group_id = $1
         where ms.user_id = e.paid_by or random() < 0.5
       )
       insert into public.expense_shares (expense_id, user_id, amount_cents)
       select expense_id, user_id,
              (amount_cents / n + case when rn <= amount_cents % n then 1 else 0 end)::int
       from participants`,
      [groupId, MEMBERS, EXPENSES],
    ),
  ])
  console.log(`+ Sembrado ${GROUP}: ${MEMBERS} miembros, ${EXPENSES} gastos`)
  return groupId
}

async function check(groupId: string) {
  const [row] = await sql.query(
    `select
       (select count(*) from public.memberships where group_id = $1)::int as members,
       (select count(*) from public.expenses where group_id = $1)::int as expenses,
       (select count(*) from public.expense_shares s join public.expenses e on e.id = s.expense_id
         where e.group_id = $1)::int as shares,
       (select count(*) from (
          select e.id from public.expenses e join public.expense_shares s on s.expense_id = e.id
          where e.group_id = $1 group by e.id, e.amount_cents having sum(s.amount_cents) <> e.amount_cents
        ) bad)::int as bad_sums`,
    [groupId],
  )
  console.log('Datos:', row)
  if (row.bad_sums !== 0) throw new Error('Hay gastos cuyas cuotas no suman el importe')
}

/** EXPLAIN ANALYZE como un miembro del grupo, con SET ROLE authenticated. */
async function measure(groupId: string, label: string, query: string, params: unknown[]) {
  const [member] = await sql.query(`select user_id from public.memberships where group_id = $1 limit 1`, [groupId])
  const claims = JSON.stringify({ sub: member.user_id, role: 'authenticated' })
  const runs: number[] = []
  let rows = 0
  for (let i = 0; i < 5; i++) {
    const res = await sql.transaction([
      sql.query('select auth.uid()'), // carga pg_session_jwt antes de simular el JWT (ver db/tests/helpers.ts)
      sql.query('set local role authenticated'),
      sql.query(`select set_config('request.jwt.claims', $1, true)`, [claims]),
      sql.query(`explain (analyze, format json) ${query}`, params),
    ])
    const plan = res[3][0]['QUERY PLAN'][0]
    runs.push(plan['Execution Time'])
    rows = plan.Plan['Actual Rows']
  }
  runs.sort((a, b) => a - b)
  const median = runs[Math.floor(runs.length / 2)]
  const verdict = median <= LIMIT_MS ? 'OK' : 'SUPERA EL LÍMITE'
  console.log(
    `${label}: mediana ${median.toFixed(1)} ms (min ${runs[0].toFixed(1)}, max ${runs.at(-1)!.toFixed(1)}), ${rows} filas → ${verdict}`,
  )
  return median
}

async function main() {
  const groupId = await seed()
  await check(groupId)
  console.log(`\nTiempo de ejecución en Postgres (EXPLAIN ANALYZE, 5 repeticiones, límite ${LIMIT_MS} ms):`)
  await measure(
    groupId,
    'expense_shares del grupo (lectura de la Data API)',
    `select s.expense_id, s.user_id, s.amount_cents
     from public.expense_shares s
     where s.expense_id in (select e.id from public.expenses e where e.group_id = $1 and e.deleted_at is null)`,
    [groupId],
  )
  await measure(
    groupId,
    'expenses del grupo',
    `select id, paid_by, amount_cents, deleted_at from public.expenses where group_id = $1`,
    [groupId],
  )
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
