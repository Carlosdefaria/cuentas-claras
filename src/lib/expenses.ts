// Gastos y saldos por la Data API (RLS: solo grupos de los que soy miembro). Los saldos no se guardan: se calculan
// siempre con computeBalances (src/domain/balances.ts), la única lógica de saldo de la app.

import { parseActivity, type ActivityEvent } from '../domain/activity'
import { computeBalances, type Settlement } from '../domain/balances'
import type { ValidExpense } from '../domain/expenseForm'
import type { DataApi } from './dataApi'
import { isUuid } from './groups'

export interface ExpenseRow {
  id: string
  groupId: string
  description: string
  amountCents: number
  paidBy: string
  date: string
  createdAt: string
  /** Quien lo añadió: el único que puede editarlo o borrarlo. */
  createdBy: string
  /** Versión para el bloqueo optimista de update_expense (se manda tal cual la devolvió la Data API). */
  updatedAt: string
  shares: { userId: string; amountCents: number }[]
}

interface RawExpense {
  id: string
  group_id: string
  description: string
  amount_cents: number
  paid_by: string
  expense_date: string
  created_at: string
  created_by: string
  updated_at: string
  expense_shares: { user_id: string; amount_cents: number }[]
}

const EXPENSE_SELECT = 'id,group_id,description,amount_cents,paid_by,expense_date,created_at,created_by,updated_at,expense_shares(user_id,amount_cents)'

const toExpense = (r: RawExpense): ExpenseRow => ({
  id: r.id,
  groupId: r.group_id,
  description: r.description,
  amountCents: r.amount_cents,
  paidBy: r.paid_by,
  date: r.expense_date,
  createdAt: r.created_at,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
  shares: r.expense_shares.map((s) => ({ userId: s.user_id, amountCents: s.amount_cents })),
})

/** Gastos vivos de un grupo, del más reciente al más antiguo, con sus cuotas. */
export async function listExpenses(api: DataApi, groupId: string): Promise<ExpenseRow[]> {
  if (!isUuid(groupId)) return []
  const rows = await api.select<RawExpense[]>(
    `expenses?${groupFilter([groupId])}&deleted_at=is.null&select=${EXPENSE_SELECT}&order=expense_date.desc,created_at.desc,id.asc`,
  )
  return rows.map(toExpense)
}

/** Un gasto vivo de un grupo, o null (no existe, borrado o no soy miembro). */
export async function getExpense(api: DataApi, groupId: string, expenseId: string): Promise<ExpenseRow | null> {
  if (!isUuid(groupId) || !isUuid(expenseId)) return null
  const rows = await api.select<RawExpense[]>(
    `expenses?id=eq.${expenseId}&group_id=eq.${groupId}&deleted_at=is.null&select=${EXPENSE_SELECT}`,
  )
  return rows[0] ? toExpense(rows[0]) : null
}

interface RawSettlement {
  id: string
  group_id: string
  from_user: string
  to_user: string
  amount_cents: number
  settled_on: string
  created_at: string
  created_by: string
}

/** Pago para saldar cuentas: `fromUser` pagó a `toUser`. */
export interface SettlementRow extends Settlement {
  id: string
  groupId: string
  /** AAAA-MM-DD (fecha local del pago). */
  date: string
  createdAt: string
  /** Quien lo registró: el único que puede borrarlo. */
  createdBy: string
}

const SETTLEMENT_SELECT = 'id,group_id,from_user,to_user,amount_cents,settled_on,created_at,created_by'

const toSettlement = (r: RawSettlement): SettlementRow => ({
  id: r.id,
  groupId: r.group_id,
  fromUser: r.from_user,
  toUser: r.to_user,
  amountCents: r.amount_cents,
  date: r.settled_on,
  createdAt: r.created_at,
  createdBy: r.created_by,
})

/** Pagos vivos de uno o varios grupos, del más reciente al más antiguo. Cuentan en el saldo (computeBalances). */
export async function listSettlements(api: DataApi, groupIds: string | readonly string[]): Promise<SettlementRow[]> {
  const ids = (typeof groupIds === 'string' ? [groupIds] : groupIds).filter(isUuid)
  if (ids.length === 0) return []
  const rows = await api.select<RawSettlement[]>(
    `settlements?${groupFilter(ids)}&deleted_at=is.null&select=${SETTLEMENT_SELECT}&order=settled_on.desc,created_at.desc,id.asc`,
  )
  return rows.map(toSettlement)
}

/** Un pago vivo de un grupo, o null (no existe, borrado o no soy miembro). */
export async function getSettlement(api: DataApi, groupId: string, settlementId: string): Promise<SettlementRow | null> {
  if (!isUuid(groupId) || !isUuid(settlementId)) return null
  const rows = await api.select<RawSettlement[]>(
    `settlements?id=eq.${settlementId}&group_id=eq.${groupId}&deleted_at=is.null&select=${SETTLEMENT_SELECT}`,
  )
  return rows[0] ? toSettlement(rows[0]) : null
}

/** Registra un pago (RPC create_settlement: solo quien paga o quien cobra). Devuelve su id. */
export async function createSettlement(
  api: DataApi,
  groupId: string,
  payment: { fromUser: string; toUser: string; amountCents: number; date: string },
): Promise<string> {
  return api.rpc<string>('create_settlement', {
    p_group_id: groupId,
    p_from_user: payment.fromUser,
    p_to_user: payment.toUser,
    p_amount_cents: payment.amountCents,
    p_settled_on: payment.date,
  })
}

/** Borra un pago (soft delete, RPC delete_settlement: solo quien lo registró). */
export async function deleteSettlement(api: DataApi, settlementId: string): Promise<void> {
  await api.rpc<null>('delete_settlement', { p_settlement_id: settlementId })
}

/**
 * Filtro por grupo SIEMPRE explícito: así Postgres usa el índice por group_id y la política de RLS solo evalúa
 * las filas de esos grupos (sin filtro, recorre la tabla entera con is_member fila a fila: segundos).
 */
function groupFilter(ids: readonly string[]): string {
  return ids.length === 1 ? `group_id=eq.${ids[0]}` : `group_id=in.(${ids.join(',')})`
}

/** Saldo de cada miembro de un grupo. */
export function balancesOf(memberIds: readonly string[], expenses: readonly ExpenseRow[], settlements: readonly Settlement[]): Map<string, number> {
  return computeBalances({
    memberIds,
    expenses: expenses.map((e) => ({ id: e.id, paidBy: e.paidBy, amountCents: e.amountCents, deletedAt: null })),
    shares: expenses.flatMap((e) => e.shares.map((s) => ({ expenseId: e.id, userId: s.userId, amountCents: s.amountCents }))),
    settlements,
  })
}

/** Mi saldo en cada uno de los grupos dados (dos peticiones para todos, filtradas por grupo). */
export async function myBalancesByGroup(api: DataApi, myId: string, groupIds: readonly string[]): Promise<Map<string, number>> {
  const ids = groupIds.filter(isUuid)
  const result = new Map<string, number>(ids.map((g) => [g, 0]))
  if (ids.length === 0) return result
  const [raw, settlements] = await Promise.all([
    api.select<RawExpense[]>(`expenses?${groupFilter(ids)}&deleted_at=is.null&select=${EXPENSE_SELECT}`),
    listSettlements(api, ids),
  ])
  const expenses = raw.map(toExpense)
  for (const g of ids) {
    const balances = balancesOf(
      [myId],
      expenses.filter((e) => e.groupId === g),
      settlements.filter((s) => s.groupId === g),
    )
    result.set(g, balances.get(myId) ?? 0)
  }
  return result
}

/** Crea el gasto con sus cuotas en una sola transacción (RPC create_expense). Devuelve su id. */
export async function createExpense(api: DataApi, groupId: string, expense: ValidExpense): Promise<string> {
  return api.rpc<string>('create_expense', {
    p_group_id: groupId,
    p_description: expense.description,
    p_amount_cents: expense.amountCents,
    p_paid_by: expense.paidBy,
    p_expense_date: expense.date,
    p_shares: expense.shares.map((s) => ({ user_id: s.userId, amount_cents: s.amountCents })),
  })
}

/**
 * Edita un gasto y sustituye sus cuotas en una sola transacción (RPC update_expense). Solo quien lo añadió.
 * `expectedUpdatedAt` es la versión que se leyó: si alguien lo cambió después, la RPC responde 40001 (kind 'conflict').
 */
export async function updateExpense(api: DataApi, expenseId: string, expectedUpdatedAt: string, expense: ValidExpense): Promise<string> {
  return api.rpc<string>('update_expense', {
    p_expense_id: expenseId,
    p_expected_updated_at: expectedUpdatedAt,
    p_description: expense.description,
    p_amount_cents: expense.amountCents,
    p_paid_by: expense.paidBy,
    p_expense_date: expense.date,
    p_shares: expense.shares.map((s) => ({ user_id: s.userId, amount_cents: s.amountCents })),
  })
}

/** Borra un gasto (soft delete, RPC delete_expense). Solo quien lo añadió. */
export async function deleteExpense(api: DataApi, expenseId: string): Promise<void> {
  await api.rpc<null>('delete_expense', { p_expense_id: expenseId })
}

export interface ActivityItem {
  id: number
  actor: string
  createdAt: string
  event: Exclude<ActivityEvent, { kind: 'unknown' }>
}

interface RawActivity {
  id: number
  actor: string
  type: string
  payload: unknown
  created_at: string
}

export const ACTIVITY_PAGE = 50

/**
 * Actividad del grupo, de la más reciente a la más antigua, en páginas (cursor: id de la última fila leída).
 * Siempre filtrada por grupo. Los eventos que no se entienden se omiten.
 */
export async function listActivity(
  api: DataApi,
  groupId: string,
  { limit = ACTIVITY_PAGE, before }: { limit?: number; before?: number } = {},
): Promise<{ items: ActivityItem[]; nextBefore: number | null }> {
  if (!isUuid(groupId)) return { items: [], nextBefore: null }
  const cursor = before === undefined ? '' : `&id=lt.${Math.trunc(before)}`
  const rows = await api.select<RawActivity[]>(
    `activities?group_id=eq.${groupId}${cursor}&select=id,actor,type,payload,created_at&order=id.desc&limit=${limit + 1}`,
  )
  const page = rows.slice(0, limit)
  const items: ActivityItem[] = []
  for (const r of page) {
    const event = parseActivity(r.type, r.payload)
    if (event.kind !== 'unknown') items.push({ id: r.id, actor: r.actor, createdAt: r.created_at, event })
  }
  return { items, nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null }
}
