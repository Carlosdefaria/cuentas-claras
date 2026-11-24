// Lecturas y RPC de grupos. Todo pasa por la Data API con RLS: solo se ven los grupos de los que eres miembro.

import type { DataApi } from './dataApi'

export interface GroupSummary {
  id: string
  name: string
  memberCount: number
}

export interface GroupDetail {
  id: string
  name: string
  currency: string
  inviteCode: string
}

export interface Member {
  userId: string
  name: string
  role: 'admin' | 'member'
  joinedAt: string
  /** Cuándo lo quitaron del grupo (RF-11); null si sigue. Se conserva para poner nombre a su historial. */
  removedAt: string | null
}

export interface InvitePreview {
  groupId: string
  name: string
  memberCount: number
  isMember: boolean
}

export const GROUP_NAME_MAX = 100

/** Mis grupos, el más reciente primero, con el número de miembros activos (agregado de PostgREST). */
export async function listMyGroups(api: DataApi): Promise<GroupSummary[]> {
  const rows = await api.select<{ id: string; name: string; memberships: { count: number }[] }[]>(
    'groups?select=id,name,memberships(count)&memberships.removed_at=is.null&order=created_at.desc,id.asc',
  )
  return rows.map((r) => ({ id: r.id, name: r.name, memberCount: r.memberships[0]?.count ?? 0 }))
}

/** Un grupo del que soy miembro, o null (no existe, está borrado o no soy miembro: RLS no lo distingue). */
export async function getGroup(api: DataApi, id: string): Promise<GroupDetail | null> {
  if (!isUuid(id)) return null
  const rows = await api.select<{ id: string; name: string; currency: string; invite_code: string }[]>(
    `groups?id=eq.${id}&select=id,name,currency,invite_code`,
  )
  const r = rows[0]
  return r ? { id: r.id, name: r.name, currency: r.currency, inviteCode: r.invite_code } : null
}

/** Miembros de un grupo, por orden de llegada (el creador primero), también los que ya no están (`removedAt`). */
export async function listMembers(api: DataApi, groupId: string): Promise<Member[]> {
  if (!isUuid(groupId)) return []
  const rows = await api.select<{ user_id: string; name: string; role: 'admin' | 'member'; joined_at: string; removed_at: string | null }[]>(
    `rpc/group_members?group_id=eq.${groupId}&order=joined_at.asc,user_id.asc`,
  )
  return rows.map((r) => ({ userId: r.user_id, name: r.name, role: r.role, joinedAt: r.joined_at, removedAt: r.removed_at ?? null }))
}

/** Miembros que siguen en el grupo. */
export const activeMembers = (members: readonly Member[]): Member[] => members.filter((m) => m.removedAt === null)

/** Nombres de quienes ya no están entre `userIds` (sin repetir, por orden de llegada): un gasto o pago con alguno es
 *  de solo lectura (isReadOnly). */
export const goneNames = (userIds: readonly string[], members: readonly Member[]): string[] =>
  members.filter((m) => m.removedAt !== null && userIds.includes(m.userId)).map((m) => m.name)

/** Quitar a alguien del grupo (solo quien administra y con su saldo a 0: si no, `kind` 'unsettled'). */
export async function removeMember(api: DataApi, groupId: string, userId: string): Promise<void> {
  await api.rpc('remove_member', { p_group_id: groupId, p_user_id: userId })
}

/** Borrar el grupo (solo quien administra y con todos en paz: si no, `kind` 'unsettled'). */
export async function deleteGroup(api: DataApi, groupId: string): Promise<void> {
  await api.rpc('delete_group', { p_group_id: groupId })
}

export async function createGroup(api: DataApi, name: string): Promise<string> {
  return api.rpc<string>('create_group', { p_name: name.trim() })
}

export async function invitePreview(api: DataApi, code: string): Promise<InvitePreview> {
  const rows = await api.rpc<{ group_id: string; name: string; member_count: number; is_member: boolean }[]>('invite_preview', {
    p_invite_code: code,
  })
  const r = rows[0]
  return { groupId: r.group_id, name: r.name, memberCount: r.member_count, isMember: r.is_member }
}

export async function joinGroup(api: DataApi, code: string): Promise<string> {
  return api.rpc<string>('join_group', { p_invite_code: code })
}

export type GroupNameError = 'required' | 'tooLong'

export function validateGroupName(name: string): GroupNameError | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'required'
  if (trimmed.length > GROUP_NAME_MAX) return 'tooLong'
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: string): boolean {
  return UUID.test(value)
}
