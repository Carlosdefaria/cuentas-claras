// Tests de RLS y de las funciones RPC en la rama `test`.
// Todas las consultas de usuario se hacen con SET ROLE authenticated (o anonymous),
// como haría la Data API. Las únicas consultas como neondb_owner son preparación y limpieza.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asAnonymous, asUser, ensureUsers, one, sql } from './helpers.ts'

const TABLES = ['groups', 'memberships', 'expenses', 'expense_shares', 'settlements', 'activities'] as const
const RPCS = [
  'public.create_group(text)',
  'public.join_group(text)',
  'public.create_expense(uuid, text, integer, uuid, date, jsonb)',
  'public.group_members()',
] as const

let u: Record<string, string> // ana, bea, carlos (grupo A) · dani (grupo B) · eva (sin grupo)
let groupA: string
let groupB: string
let inviteA: string
let expenseA: string

const shares = (...pairs: [string, number][]) => JSON.stringify(pairs.map(([user_id, amount_cents]) => ({ user_id, amount_cents })))

const createExpense = (actor: string | null, groupId: string, amount: number, paidBy: string, sharesJson: string) =>
  one(actor, `select public.create_expense($1, $2, $3, $4, current_date, $5::jsonb) as id`, [
    groupId,
    'Cena',
    amount,
    paidBy,
    sharesJson,
  ])

beforeAll(async () => {
  u = await ensureUsers(['rls-ana', 'rls-bea', 'rls-carlos', 'rls-dani', 'rls-eva']).then((m) => ({
    ana: m['rls-ana'],
    bea: m['rls-bea'],
    carlos: m['rls-carlos'],
    dani: m['rls-dani'],
    eva: m['rls-eva'],
  }))

  groupA = (await one(u.ana, `select public.create_group('Viaje RLS A') as id`)).id
  groupB = (await one(u.dani, `select public.create_group('Piso RLS B') as id`)).id
  inviteA = (await one(u.ana, `select invite_code from public.groups where id = $1`, [groupA])).invite_code
  await one(u.bea, `select public.join_group($1)`, [inviteA])
  await one(u.carlos, `select public.join_group($1)`, [inviteA])

  // 10,00 € pagados por Ana entre los tres (reparto igual con resto determinista)
  expenseA = (await createExpense(u.ana, groupA, 1000, u.ana, shares([u.ana, 334], [u.bea, 333], [u.carlos, 333]))).id
})

afterAll(async () => {
  // Limpieza como neondb_owner (BYPASSRLS). Borra en cascada miembros, gastos, cuotas y actividad.
  if (u) await sql.query(`delete from public.groups where created_by = any($1::uuid[])`, [Object.values(u)])
})

describe('flujo correcto (las RPC escriben aunque RLS esté forzado)', () => {
  it('create_group deja al creador como admin y registra la actividad', async () => {
    const [members, acts] = await asUser(u.ana, () => [
      sql.query(`select user_id, role from public.memberships where group_id = $1 order by joined_at`, [groupA]),
      sql.query(`select type from public.activities where group_id = $1 order by id`, [groupA]),
    ])
    expect(members[0]).toEqual({ user_id: u.ana, role: 'admin' })
    expect(members).toHaveLength(3)
    expect(acts.map((a) => a.type)).toEqual(['group_created', 'member_joined', 'member_joined', 'expense_created'])
  })

  it('el código de invitación es largo y aleatorio (≥ 22 caracteres base64url)', () => {
    expect(inviteA).toMatch(/^[A-Za-z0-9_-]{22,}$/)
  })

  it('join_group es idempotente', async () => {
    await one(u.bea, `select public.join_group($1)`, [inviteA])
    const row = await one(u.bea, `select count(*)::int as n from public.memberships where group_id = $1`, [groupA])
    expect(row.n).toBe(3)
  })

  it('create_expense guarda gasto y cuotas; created_by sale de la sesión', async () => {
    const [exp, sh] = await asUser(u.bea, () => [
      sql.query(`select amount_cents, paid_by, created_by from public.expenses where id = $1`, [expenseA]),
      sql.query(`select sum(amount_cents)::int as total, count(*)::int as n from public.expense_shares where expense_id = $1`, [expenseA]),
    ])
    expect(exp[0]).toEqual({ amount_cents: 1000, paid_by: u.ana, created_by: u.ana })
    expect(sh[0]).toEqual({ total: 1000, n: 3 })
  })

  it('created_by es quien llama aunque pague otro', async () => {
    const { id } = await createExpense(u.bea, groupA, 600, u.carlos, shares([u.ana, 300], [u.bea, 300]))
    const row = await one(u.ana, `select paid_by, created_by from public.expenses where id = $1`, [id])
    expect(row).toEqual({ paid_by: u.carlos, created_by: u.bea })
  })
})

describe('aislamiento entre grupos (SELECT con RLS)', () => {
  it.each(TABLES)('un no miembro no ve filas de %s del grupo A', async (table) => {
    const col = table === 'groups' ? 'id' : table === 'expense_shares' ? null : 'group_id'
    const query =
      col === null
        ? `select count(*)::int as n from public.expense_shares where expense_id = $1`
        : `select count(*)::int as n from public.${table} where ${col} = $1`
    const param = col === null ? expenseA : groupA
    expect((await one(u.dani, query, [param])).n).toBe(0)
    expect((await one(u.eva, query, [param])).n).toBe(0)
  })

  it('cada usuario solo ve sus grupos', async () => {
    const [anaGroups, daniGroups] = await Promise.all([
      asUser(u.ana, () => [sql.query(`select id from public.groups`)]),
      asUser(u.dani, () => [sql.query(`select id from public.groups`)]),
    ])
    const anaIds = anaGroups[0].map((r) => r.id)
    const daniIds = daniGroups[0].map((r) => r.id)
    expect(anaIds).toContain(groupA)
    expect(anaIds).not.toContain(groupB)
    expect(daniIds).toContain(groupB)
    expect(daniIds).not.toContain(groupA)
  })
})

describe('group_members()', () => {
  it('devuelve id y nombre solo de los miembros de mis grupos, sin email', async () => {
    const [rows] = await asUser(u.dani, () => [sql.query(`select * from public.group_members()`)])
    expect(rows.every((r) => r.group_id === groupB)).toBe(true)
    expect(rows.map((r) => r.user_id)).toEqual([u.dani])
    expect(Object.keys(rows[0]).sort()).toEqual(['group_id', 'joined_at', 'name', 'role', 'user_id'])
  })

  it('un miembro del grupo A ve a sus tres miembros con nombre', async () => {
    const [rows] = await asUser(u.carlos, () => [sql.query(`select user_id, name from public.group_members() where group_id = $1`, [groupA])])
    expect(rows.map((r) => r.user_id).sort()).toEqual([u.ana, u.bea, u.carlos].sort())
    expect(rows.find((r) => r.user_id === u.ana)?.name).toBe('rls-ana')
  })

  it('sin grupos no devuelve nada', async () => {
    const [rows] = await asUser(u.eva, () => [sql.query(`select * from public.group_members()`)])
    expect(rows).toEqual([])
  })

  it('authenticated no puede leer neon_auth."user" directamente', async () => {
    await expect(one(u.ana, `select email from neon_auth."user" limit 1`)).rejects.toThrow(/permission denied/)
  })
})

describe('escrituras directas rechazadas (solo se escribe vía RPC)', () => {
  it.each(TABLES)('INSERT directo en %s', async (table) => {
    const stmt = {
      groups: `insert into public.groups (name, created_by) values ('x', '${'00000000-0000-4000-8000-000000000000'}')`,
      memberships: `insert into public.memberships (group_id, user_id) values ('${'00000000-0000-4000-8000-000000000000'}', '${'00000000-0000-4000-8000-000000000000'}')`,
      expenses: `insert into public.expenses (group_id, description, amount_cents, paid_by, created_by) values (gen_random_uuid(), 'x', 1, gen_random_uuid(), gen_random_uuid())`,
      expense_shares: `insert into public.expense_shares (expense_id, user_id, amount_cents) values (gen_random_uuid(), gen_random_uuid(), 1)`,
      settlements: `insert into public.settlements (group_id, from_user, to_user, amount_cents, created_by) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid())`,
      activities: `insert into public.activities (group_id, actor, type) values (gen_random_uuid(), gen_random_uuid(), 'group_created')`,
    }[table]
    await expect(one(u.ana, stmt)).rejects.toThrow(/permission denied/)
  })

  it.each(TABLES)('UPDATE directo en %s (aunque sea miembro)', async (table) => {
    const col = { groups: 'deleted_at = now()', memberships: `role = 'admin'`, expenses: 'amount_cents = 1', expense_shares: 'amount_cents = 1', settlements: 'amount_cents = 1', activities: `payload = '{}'` }[table]
    await expect(one(u.bea, `update public.${table} set ${col}`)).rejects.toThrow(/permission denied/)
  })

  it.each(TABLES)('DELETE directo en %s (aunque sea miembro)', async (table) => {
    await expect(one(u.ana, `delete from public.${table}`)).rejects.toThrow(/permission denied/)
  })

  it('los datos siguen intactos tras los intentos', async () => {
    const row = await one(u.ana, `select amount_cents, deleted_at from public.expenses where id = $1`, [expenseA])
    expect(row).toEqual({ amount_cents: 1000, deleted_at: null })
  })
})

describe('create_expense: validaciones', () => {
  it('rechaza a un no miembro en un grupo ajeno', async () => {
    await expect(createExpense(u.dani, groupA, 1000, u.dani, shares([u.dani, 1000]))).rejects.toThrow(/No eres miembro/)
  })

  it('rechaza a un no miembro aunque ponga a miembros como pagador y participantes', async () => {
    await expect(createExpense(u.eva, groupA, 1000, u.ana, shares([u.ana, 500], [u.bea, 500]))).rejects.toThrow(/No eres miembro/)
  })

  it('rechaza un pagador que no es miembro', async () => {
    await expect(createExpense(u.ana, groupA, 1000, u.dani, shares([u.ana, 500], [u.bea, 500]))).rejects.toThrow(/pagador no es miembro/)
  })

  it('rechaza participantes repetidos', async () => {
    await expect(createExpense(u.ana, groupA, 1000, u.ana, shares([u.bea, 500], [u.bea, 500]))).rejects.toThrow(/repetidos/)
  })

  it('rechaza participantes que no son miembros', async () => {
    await expect(createExpense(u.ana, groupA, 1000, u.ana, shares([u.ana, 500], [u.dani, 500]))).rejects.toThrow(/no son miembros/)
  })

  it.each([
    ['de más', 1001],
    ['de menos', 999],
  ])('rechaza cuotas que suman %s', async (_label, total) => {
    await expect(createExpense(u.ana, groupA, 1000, u.ana, shares([u.ana, total - 500], [u.bea, 500]))).rejects.toThrow(/Las cuotas suman/)
  })

  it.each([0, -100])('rechaza importe %i', async (amount) => {
    await expect(createExpense(u.ana, groupA, amount, u.ana, shares([u.ana, amount]))).rejects.toThrow(/mayor que 0/)
  })

  it('rechaza cuotas negativas', async () => {
    await expect(createExpense(u.ana, groupA, 1000, u.ana, shares([u.ana, 1100], [u.bea, -100]))).rejects.toThrow(/Cuota no válida/)
  })

  it('rechaza importes no enteros en las cuotas', async () => {
    await expect(createExpense(u.ana, groupA, 1000, u.ana, shares([u.ana, 500.5], [u.bea, 499.5]))).rejects.toThrow(/integer/)
  })

  it('rechaza una lista de participantes vacía', async () => {
    await expect(createExpense(u.ana, groupA, 1000, u.ana, '[]')).rejects.toThrow(/al menos un participante/)
  })

  it('rechaza un grupo borrado (soft delete)', async () => {
    const { id } = await one(u.ana, `select public.create_group('Grupo para borrar') as id`)
    await sql.query(`update public.groups set deleted_at = now() where id = $1`, [id]) // preparación como owner
    await expect(createExpense(u.ana, id, 1000, u.ana, shares([u.ana, 1000]))).rejects.toThrow(/Grupo no encontrado/)
    expect((await one(u.ana, `select count(*)::int as n from public.groups where id = $1`, [id])).n).toBe(0)
  })

  it('un gasto rechazado no deja nada a medias', async () => {
    const before = await one(u.ana, `select count(*)::int as n from public.expenses where group_id = $1`, [groupA])
    await expect(createExpense(u.ana, groupA, 1000, u.ana, shares([u.ana, 1]))).rejects.toThrow()
    const after = await one(u.ana, `select count(*)::int as n from public.expenses where group_id = $1`, [groupA])
    expect(after.n).toBe(before.n)
  })
})

describe('join_group: validaciones', () => {
  it('rechaza un código inventado', async () => {
    await expect(one(u.eva, `select public.join_group('codigo-inventado-123456')`)).rejects.toThrow(/no válido/)
  })
})

describe('sin sesión (rol authenticated sin claims)', () => {
  it.each([
    [`select public.create_group('x')`],
    [`select public.join_group('x')`],
  ])('%s → No autenticado', async (q) => {
    await expect(one(null, q)).rejects.toThrow(/No autenticado/)
  })

  it('create_expense → No autenticado', async () => {
    await expect(createExpense(null, groupA, 1000, u.ana, shares([u.ana, 1000]))).rejects.toThrow(/No autenticado/)
  })

  it.each(TABLES)('no ve ninguna fila de %s', async (table) => {
    expect((await one(null, `select count(*)::int as n from public.${table}`)).n).toBe(0)
  })

  it('group_members() devuelve vacío', async () => {
    const [rows] = await asUser(null, () => [sql.query(`select * from public.group_members()`)])
    expect(rows).toEqual([])
  })
})

describe('la identidad no se filtra entre transacciones (conexiones reutilizadas)', () => {
  it('alternando ana / dani / sin sesión, cada transacción ve solo lo suyo', async () => {
    const seq = [u.ana, u.dani, null, u.ana, null, u.dani, u.eva, u.ana, null, u.dani]
    for (let round = 0; round < 3; round++) {
      for (const who of seq) {
        const [rows] = await asUser(who, () => [sql.query(`select id from public.groups where id = any($1::uuid[])`, [[groupA, groupB]])])
        const ids = rows.map((r) => r.id)
        const expected = who === u.ana ? [groupA] : who === u.dani ? [groupB] : []
        expect(ids, `usuario ${who ?? 'sin sesión'}`).toEqual(expected)
      }
    }
  })

  it('sin sesión justo después de una transacción con sesión sigue sin autenticar', async () => {
    for (let i = 0; i < 5; i++) {
      await one(u.ana, `select count(*) from public.groups`)
      await expect(one(null, `select public.create_group('no debería crearse')`)).rejects.toThrow(/No autenticado/)
    }
  })
})

describe('rol anonymous (peticiones sin token)', () => {
  it.each(RPCS)('no tiene EXECUTE sobre %s', async (fn) => {
    const [rows] = await asAnonymous(() => [sql.query(`select has_function_privilege($1, 'EXECUTE') as ok`, [fn])])
    expect(rows[0].ok).toBe(false)
  })

  it('llamar a create_group falla por permisos', async () => {
    await expect(asAnonymous(() => [sql.query(`select public.create_group('x')`)])).rejects.toThrow(/permission denied/)
  })

  it.each(TABLES)('no puede leer %s', async (table) => {
    await expect(asAnonymous(() => [sql.query(`select 1 from public.${table} limit 1`)])).rejects.toThrow(/permission denied/)
  })

  it('no puede ejecutar app_private.my_group_ids() (la usan las políticas, solo para authenticated)', async () => {
    await expect(asAnonymous(() => [sql.query(`select * from app_private.my_group_ids()`)])).rejects.toThrow(/permission denied/)
  })

  it('no puede usar el esquema app_private', async () => {
    await expect(asAnonymous(() => [sql.query(`select app_private.is_member(gen_random_uuid())`)])).rejects.toThrow(/permission denied/)
  })
})
