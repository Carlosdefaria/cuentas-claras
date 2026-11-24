// Quitar miembros y borrar el grupo (RF-11). Puras: deciden qué ofrece la interfaz; la BD (remove_member, delete_group,
// lock_own_expense, delete_settlement) aplica las mismas reglas y es quien manda.
//
// - Solo quien administra (role 'admin' y sigue en el grupo) quita a otros o borra el grupo; nunca se quita a sí mismo.
// - Quitar a alguien: solo si su saldo es 0. Borrar el grupo: solo si todos tienen saldo 0.
// - Un gasto o pago en el que participa alguien que ya no está es de solo lectura (su saldo tiene que seguir en 0).

export interface GroupMember {
  userId: string
  role: 'admin' | 'member'
  /** Cuándo lo quitaron del grupo; null si sigue. */
  removedAt: string | null
}

export type RemoveCheck =
  | { ok: true }
  | { ok: false; reason: 'not-admin' | 'self' | 'not-member' }
  | { ok: false; reason: 'unsettled'; balanceCents: number }

export type DeleteGroupCheck =
  | { ok: true }
  | { ok: false; reason: 'not-admin' }
  | { ok: false; reason: 'unsettled'; pending: { userId: string; balanceCents: number }[] }

const active = (members: readonly GroupMember[], id: string | null) => members.find((m) => m.userId === id && m.removedAt === null)

export function isAdmin(members: readonly GroupMember[], userId: string | null): boolean {
  return active(members, userId)?.role === 'admin'
}

export function canRemoveMember(
  members: readonly GroupMember[],
  actorId: string | null,
  targetId: string,
  balances: ReadonlyMap<string, number>,
): RemoveCheck {
  if (!isAdmin(members, actorId)) return { ok: false, reason: 'not-admin' }
  if (targetId === actorId) return { ok: false, reason: 'self' }
  if (!active(members, targetId)) return { ok: false, reason: 'not-member' }
  const balanceCents = balances.get(targetId) ?? 0
  return balanceCents === 0 ? { ok: true } : { ok: false, reason: 'unsettled', balanceCents }
}

export function canDeleteGroup(members: readonly GroupMember[], actorId: string | null, balances: ReadonlyMap<string, number>): DeleteGroupCheck {
  if (!isAdmin(members, actorId)) return { ok: false, reason: 'not-admin' }
  const pending = members
    .map((m) => ({ userId: m.userId, balanceCents: balances.get(m.userId) ?? 0 }))
    .filter((p) => p.balanceCents !== 0)
  return pending.length === 0 ? { ok: true } : { ok: false, reason: 'unsettled', pending }
}

/** ¿Participa alguien que ya no está? (pagador y participantes de un gasto, o quien paga y quien cobra en un pago) */
export function isReadOnly(involved: readonly string[], members: readonly GroupMember[]): boolean {
  const removed = new Set(members.filter((m) => m.removedAt !== null).map((m) => m.userId))
  return involved.some((id) => removed.has(id))
}
