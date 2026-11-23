// Formulario de gasto: validación y cuotas, a partes iguales, por importes o por porcentajes (RF-05).
// Funciones puras; los céntimos, siempre enteros; los porcentajes, en puntos básicos (33,33 % = 3333).

import { basisPointsToText, centsToInputText, parseEurosToCents, parsePercentToBasisPoints } from './money.ts'
import { compareIds, splitByPercent, splitEqual } from './split.ts'

export type SplitType = 'equal' | 'amounts' | 'percent'

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
  /** Cómo se reparte (por defecto, a partes iguales entre `participants`). */
  splitType?: SplitType
  /** Por importes: lo que escribió cada persona (vacío o 0 = no participa). */
  amounts?: Readonly<Record<string, string>>
  /** Por porcentajes: el % que escribió cada persona (vacío o 0 = no participa). */
  percents?: Readonly<Record<string, string>>
}

export interface ShareDraft {
  userId: string
  amountCents: number
  /** Solo en repartos por porcentajes. */
  percentBp?: number
}

export interface ValidExpense {
  amountCents: number
  description: string
  paidBy: string
  date: string
  splitType: SplitType
  shares: ShareDraft[]
}

export type ExpenseError = 'required' | 'invalid' | 'zero' | 'tooLarge' | 'tooLong'
export type ExpenseErrors = Partial<Record<'amount' | 'description' | 'paidBy' | 'participants' | 'date', ExpenseError>> & {
  /** Por importes: no suman el total · por porcentajes: no suman 100 %. */
  split?: 'amountsMismatch' | 'percentMismatch'
  /** Filas con un importe o porcentaje mal escrito. */
  shares?: Record<string, 'invalid'>
}

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
/** AAAA-MM-DD que existe en el calendario. */
export function isValidDate(value: string): boolean {
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

  const splitType = draft.splitType ?? 'equal'
  const totalOk = errors.amount === undefined
  let shares: ShareDraft[] = []

  if (splitType === 'equal') {
    const participants = [...new Set(draft.participants)]
    if (participants.length === 0) errors.participants = 'required'
    else if (participants.some((p) => !members.has(p))) errors.participants = 'invalid'
    else if (totalOk) shares = sharesFor(amountCents!, participants)
  } else {
    // Por importes o por porcentajes: cada fila con su valor; vacío o 0 = no participa.
    const parse = splitType === 'amounts' ? parseEurosToCents : parsePercentToBasisPoints
    const values = new Map<string, number>()
    const bad: Record<string, 'invalid'> = {}
    for (const [id, text] of Object.entries((splitType === 'amounts' ? draft.amounts : draft.percents) ?? {})) {
      if (text.trim() === '') continue
      const v = parse(text)
      if (v === null) bad[id] = 'invalid'
      else if (v > 0) values.set(id, v)
    }
    const total = [...values.values()].reduce((a, v) => a + v, 0)
    if (Object.keys(bad).length > 0) errors.shares = bad
    else if (values.size === 0) errors.participants = 'required'
    else if ([...values.keys()].some((id) => !members.has(id))) errors.participants = 'invalid'
    else if (splitType === 'percent' && total !== 10000) errors.split = 'percentMismatch'
    else if (splitType === 'amounts' && totalOk && total !== amountCents) errors.split = 'amountsMismatch'
    else if (totalOk) {
      const ids = [...values.keys()].sort(compareIds)
      shares =
        splitType === 'amounts'
          ? ids.map((userId) => ({ userId, amountCents: values.get(userId)! }))
          : [...splitByPercent(amountCents!, values)].map(([userId, cents]) => ({ userId, amountCents: cents, percentBp: values.get(userId)! }))
    }
  }

  if (!isValidDate(draft.date)) errors.date = 'invalid'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { amountCents: amountCents!, description, paidBy: draft.paidBy!, date: draft.date, splitType, shares } }
}

/** Lo que falta o sobra mientras se escribe (por importes, en céntimos; por porcentajes, en puntos básicos). */
export type SplitSummary =
  | { kind: 'amounts'; assignedCents: number; totalCents: number | null; diffCents: number | null }
  | { kind: 'percent'; assignedBp: number; diffBp: number }

export function splitSummary(draft: ExpenseDraft): SplitSummary | null {
  const type = draft.splitType ?? 'equal'
  if (type === 'equal') return null
  const sumOf = (texts: Readonly<Record<string, string>> | undefined, parse: (t: string) => number | null) =>
    Object.values(texts ?? {}).reduce((a, t) => a + (parse(t) ?? 0), 0)
  if (type === 'percent') {
    const assignedBp = sumOf(draft.percents, parsePercentToBasisPoints)
    return { kind: 'percent', assignedBp, diffBp: 10000 - assignedBp }
  }
  const assignedCents = sumOf(draft.amounts, parseEurosToCents)
  const totalCents = draft.amountText.trim() ? parseEurosToCents(draft.amountText) : null
  return { kind: 'amounts', assignedCents, totalCents, diffCents: totalCents === null ? null : totalCents - assignedCents }
}

/** Lo que el formulario necesita de un gasto guardado para editarlo. */
export interface SavedExpense {
  amountCents: number
  description: string
  paidBy: string
  date: string
  splitType?: SplitType
  shares: readonly ShareDraft[]
}

/**
 * Borrador del formulario con un gasto guardado (editar): los participantes son quienes tienen cuota; por importes o
 * por porcentajes, cada uno con lo que se guardó.
 */
export function draftFromExpense(expense: SavedExpense, memberIds: readonly string[]): ExpenseDraft {
  const splitType = expense.splitType ?? 'equal'
  const byUser = (f: (s: ShareDraft) => string) => Object.fromEntries(expense.shares.map((s) => [s.userId, f(s)]))
  return {
    amountText: centsToInputText(expense.amountCents),
    description: expense.description,
    paidBy: expense.paidBy,
    participants: expense.shares.map((s) => s.userId).sort(compareIds),
    date: expense.date,
    memberIds,
    splitType,
    amounts: splitType === 'amounts' ? byUser((s) => centsToInputText(s.amountCents)) : {},
    percents: splitType === 'percent' ? byUser((s) => basisPointsToText(s.percentBp ?? 0)) : {},
  }
}

/** ¿El gasto validado es igual al guardado? (mismo importe, concepto, pagador, fecha, tipo de reparto y cuotas). */
export function isUnchanged(saved: SavedExpense, next: ValidExpense): boolean {
  if (saved.amountCents !== next.amountCents || saved.description.trim() !== next.description) return false
  if (saved.paidBy !== next.paidBy || saved.date !== next.date || saved.shares.length !== next.shares.length) return false
  if ((saved.splitType ?? 'equal') !== next.splitType) return false
  const before = new Map(saved.shares.map((s) => [s.userId, s]))
  return next.shares.every((s) => {
    const b = before.get(s.userId)
    return b !== undefined && b.amountCents === s.amountCents && (b.percentBp ?? null) === (s.percentBp ?? null)
  })
}
