// Actividad del grupo (RF-10): convierte cada fila de `activities` (tipo + payload jsonb) en un evento tipado.
// Pura y defensiva: un payload antiguo o raro nunca rompe la pantalla (campos malos se ignoran; si falta lo
// esencial, el evento queda como «unknown» y la UI lo omite).

export type ActivityChange =
  | { field: 'amount'; from: number; to: number }
  | { field: 'description'; from: string; to: string }
  | { field: 'paidBy'; from: string; to: string }
  | { field: 'date'; from: string; to: string }
  | { field: 'participants'; added: string[]; removed: string[] }
  | { field: 'split' }

export type ActivityEvent =
  | { kind: 'expense_created'; expenseId: string; description: string; amountCents: number }
  | { kind: 'expense_updated'; expenseId: string; description: string; amountCents: number; changes: ActivityChange[] }
  | { kind: 'expense_deleted'; expenseId: string; description: string; amountCents: number; paidBy: string | null }
  | { kind: 'member_joined' }
  | { kind: 'group_created'; name: string | null }
  | { kind: 'unknown' }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const cents = (v: unknown): number | null => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function pair<T>(v: unknown, read: (x: unknown) => T | null): { from: T; to: T } | null {
  if (!isObj(v)) return null
  const from = read(v.from)
  const to = read(v.to)
  return from === null || to === null ? null : { from, to }
}

function changesOf(raw: unknown): ActivityChange[] {
  if (!isObj(raw)) return []
  const out: ActivityChange[] = []
  const amount = pair(raw.amount_cents, cents)
  if (amount) out.push({ field: 'amount', ...amount })
  const description = pair(raw.description, str)
  if (description) out.push({ field: 'description', ...description })
  const paidBy = pair(raw.paid_by, str)
  if (paidBy) out.push({ field: 'paidBy', ...paidBy })
  const date = pair(raw.expense_date, str)
  if (date) out.push({ field: 'date', ...date })
  if (isObj(raw.participants)) {
    const added = strings(raw.participants.added)
    const removed = strings(raw.participants.removed)
    if (added.length > 0 || removed.length > 0) out.push({ field: 'participants', added, removed })
  }
  if (raw.split === true) out.push({ field: 'split' })
  return out
}

export function parseActivity(type: string, payload: unknown): ActivityEvent {
  const p = isObj(payload) ? payload : null
  if (type === 'member_joined') return { kind: 'member_joined' }
  if (type === 'group_created') return { kind: 'group_created', name: str(p?.name) }
  if (!p) return { kind: 'unknown' }

  const expenseId = str(p.expense_id)
  const description = str(p.description)
  const amountCents = cents(p.amount_cents)
  if (expenseId === null || description === null || amountCents === null) return { kind: 'unknown' }

  switch (type) {
    case 'expense_created':
      return { kind: 'expense_created', expenseId, description, amountCents }
    case 'expense_updated':
      return { kind: 'expense_updated', expenseId, description, amountCents, changes: changesOf(p.changes) }
    case 'expense_deleted':
      return { kind: 'expense_deleted', expenseId, description, amountCents, paidBy: str(p.paid_by) }
    default:
      return { kind: 'unknown' }
  }
}
