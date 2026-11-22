// Grupos e invitaciones (migración 0005) en la rama `test`: lo que necesitan las pantallas de grupos.
// Siempre con SET ROLE authenticated / anonymous, como la Data API.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asAnonymous, asUser, ensureUsers, one, sql } from './helpers.ts'

let u: Record<string, string> // ana (crea), bea (se une), eva (sin grupo)
let group: string
let invite: string
let deletedInvite: string

beforeAll(async () => {
  u = await ensureUsers(['grp-ana', 'grp-bea', 'grp-eva']).then((m) => ({ ana: m['grp-ana'], bea: m['grp-bea'], eva: m['grp-eva'] }))
  group = (await one(u.ana, `select public.create_group('  Lisboa, puente de diciembre ') as id`)).id
  invite = (await one(u.ana, `select invite_code from public.groups where id = $1`, [group])).invite_code

  const deleted = (await one(u.ana, `select public.create_group('Grupo borrado') as id`)).id
  deletedInvite = (await one(u.ana, `select invite_code from public.groups where id = $1`, [deleted])).invite_code
  await sql.query(`update public.groups set deleted_at = now() where id = $1`, [deleted]) // como neondb_owner
})

afterAll(async () => {
  if (u) await sql.query(`delete from public.groups where created_by = any($1::uuid[])`, [Object.values(u)])
})

const preview = (who: string | null, code: string) => one(who, `select * from public.invite_preview($1)`, [code])

describe('invite_preview', () => {
  it('un no miembro ve id, nombre (recortado), número de miembros y que no es miembro; nada más', async () => {
    const row = await preview(u.eva, invite)
    expect(row).toEqual({ group_id: group, name: 'Lisboa, puente de diciembre', member_count: 1, is_member: false })
  })

  it('no le da acceso al grupo: sigue sin ver sus filas', async () => {
    await preview(u.eva, invite)
    expect((await one(u.eva, `select count(*)::int as n from public.groups where id = $1`, [group])).n).toBe(0)
    const [members] = await asUser(u.eva, () => [sql.query(`select * from public.group_members()`)])
    expect(members).toEqual([])
  })

  it('quien ya es miembro lo ve marcado', async () => {
    expect((await preview(u.ana, invite)).is_member).toBe(true)
  })

  it('código inventado y grupo borrado dan el mismo error', async () => {
    await expect(preview(u.eva, 'codigo-inventado-1234567')).rejects.toThrow(/Código de invitación no válido/)
    await expect(preview(u.eva, deletedInvite)).rejects.toThrow(/Código de invitación no válido/)
  })

  it('sin sesión → No autenticado', async () => {
    await expect(preview(null, invite)).rejects.toThrow(/No autenticado/)
  })

  it('anonymous no tiene EXECUTE', async () => {
    const [rows] = await asAnonymous(() => [
      sql.query(`select has_function_privilege('public.invite_preview(text)', 'EXECUTE') as ok`),
    ])
    expect(rows[0].ok).toBe(false)
    await expect(asAnonymous(() => [sql.query(`select * from public.invite_preview($1)`, [invite])])).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('unirse con el enlace', () => {
  it('previsualizar → unirse → ver el grupo y sus miembros; el recuento sube', async () => {
    expect((await preview(u.bea, invite)).is_member).toBe(false)
    expect((await one(u.bea, `select public.join_group($1) as id`, [invite])).id).toBe(group)

    const after = await preview(u.bea, invite)
    expect(after).toMatchObject({ member_count: 2, is_member: true })

    const [groups, members] = await asUser(u.bea, () => [
      sql.query(`select id, name from public.groups`),
      sql.query(`select user_id, role from public.group_members() where group_id = $1`, [group]),
    ])
    expect(groups).toEqual([{ id: group, name: 'Lisboa, puente de diciembre' }])
    expect(members).toEqual([
      { user_id: u.ana, role: 'admin' },
      { user_id: u.bea, role: 'member' },
    ])
  })

  it('no se puede unir a un grupo borrado', async () => {
    await expect(one(u.eva, `select public.join_group($1)`, [deletedInvite])).rejects.toThrow(/no válido/)
  })
})

describe('lista de mis grupos (lo que lee la pantalla Grupos)', () => {
  it('cada grupo con su número de miembros, solo los míos y sin borrados', async () => {
    const [rows] = await asUser(u.ana, () => [
      sql.query(
        `select g.id, g.name, (select count(*)::int from public.memberships m where m.group_id = g.id) as n
         from public.groups g order by g.created_at desc`,
      ),
    ])
    expect(rows).toEqual([{ id: group, name: 'Lisboa, puente de diciembre', n: 2 }])
  })

  it('quien no tiene grupos no ve ninguno', async () => {
    expect((await one(u.eva, `select count(*)::int as n from public.groups`)).n).toBe(0)
  })

  it('create_group rechaza un nombre vacío o de más de 100 caracteres', async () => {
    await expect(one(u.eva, `select public.create_group('   ')`)).rejects.toThrow(/check constraint/)
    await expect(one(u.eva, `select public.create_group($1)`, ['x'.repeat(101)])).rejects.toThrow(/check constraint/)
  })
})
