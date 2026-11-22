// Gastos y saldos por la Data API (RLS: solo grupos de los que soy miembro). Los saldos no se guardan: se calculan
// siempre con computeBalances (src/domain/balances.ts), la única lógica de saldo de la app.

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
  expense_shares: { user_id: string; amount_cents: number }[]
}

const EXPENSE_SELECT = 'id,group_id,description,amount_cents,paid_by,expense_date,created_at,expense_shares(user_id,amount_cents)'

const toExpense = (r: RawExpense): ExpenseRow => ({
  id: r.id,
  groupId: r.group_id,
  description: r.description,
  amountCents: r.amount_cents,
  paidBy: r.paid_by,
  date: r.expense_date,
  createdAt: r.created_at,
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
  group_id: string
  from_user: string
  to_user: string
  amount_cents: number
}

/** Pagos vivos de uno o varios grupos. Aún no hay UI para crearlos (Fase 2), pero cuentan en el saldo. */
export async function listSettlements(api: DataApi, groupIds: string | readonly string[]): Promise<(Settlement & { groupId: string })[]> {
  const ids = (typeof groupIds === 'string' ? [groupIds] : groupIds).filter(isUuid)
  if (ids.length === 0) return []
  const rows = await api.select<RawSettlement[]>(
    `settlements?${groupFilter(ids)}&deleted_at=is.null&select=group_id,from_user,to_user,amount_cents`,
  )
  return rows.map((r) => ({ groupId: r.group_id, fromUser: r.from_user, toUser: r.to_user, amountCents: r.amount_cents }))
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
