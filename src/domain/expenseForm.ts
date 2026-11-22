// Formulario de gasto (reparto igual): validación y cuotas. Funciones puras; los céntimos, siempre enteros.

import { parseEurosToCents } from './money.ts'
import { splitEqual } from './split.ts'

/** Tope por gasto: 1.000.000,00 € (cabe de sobra en el integer de la BD). */
export const MAX_EXPENSE_CENTS = 100_000_000
export const DESCRIPTION_MAX = 200

export interface ExpenseDraft {
  amountText: string
  description: string
  paidBy: string | null
  participants: readonly string[]
  /** AAAA-MM-DD (fecha local). */
  date: string
  memberIds: readonly string[]
}

export interface ShareDraft {
  userId: string
  amountCents: number
}

export interface ValidExpense {
  amountCents: number
  description: string
  paidBy: string
  date: string
  shares: ShareDraft[]
}

export type ExpenseError = 'required' | 'invalid' | 'zero' | 'tooLarge' | 'tooLong'
export type ExpenseErrors = Partial<Record<'amount' | 'description' | 'paidBy' | 'participants' | 'date', ExpenseError>>

/** Cuotas del reparto igual, por orden ascendente de id (el mismo que decide quién recibe los céntimos de más). */
export function sharesFor(amountCents: number, participants: readonly string[]): ShareDraft[] {
  return [...splitEqual(amountCents, [...new Set(participants)])].map(([userId, cents]) => ({ userId, amountCents: cents }))
}

/** Quién recibe 1 céntimo de más cuando el importe no se divide exacto. */
export function remainderRecipients(amountCents: number, participants: readonly string[]): string[] {
  const shares = sharesFor(amountCents, participants)
  const base = Math.floor(amountCents / shares.length)
  return shares.filter((s) => s.amountCents > base).map((s) => s.userId)
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

export function validateExpense(draft: ExpenseDraft): { ok: true; value: ValidExpense } | { ok: false; errors: ExpenseErrors } {
  const errors: ExpenseErrors = {}

  const amountText = draft.amountText.trim()
  const amountCents = amountText ? parseEurosToCents(amountText) : null
  if (!amountText) errors.amount = 'required'
  else if (amountCents === null) errors.amount = 'invalid'
  else if (amountCents === 0) errors.amount = 'zero'
  else if (amountCents > MAX_EXPENSE_CENTS) errors.amount = 'tooLarge'

  const description = draft.description.trim()
  if (!description) errors.description = 'required'
  else if (description.length > DESCRIPTION_MAX) errors.description = 'tooLong'

  const members = new Set(draft.memberIds)
  if (!draft.paidBy) errors.paidBy = 'required'
  else if (!members.has(draft.paidBy)) errors.paidBy = 'invalid'

  const participants = [...new Set(draft.participants)]
  if (participants.length === 0) errors.participants = 'required'
  else if (participants.some((p) => !members.has(p))) errors.participants = 'invalid'

  if (!isValidDate(draft.date)) errors.date = 'invalid'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { amountCents: amountCents!, description, paidBy: draft.paidBy!, date: draft.date, shares: sharesFor(amountCents!, participants) },
  }
}
