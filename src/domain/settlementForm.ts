// Formulario de pago (registrar que alguien pagó a otra persona para saldar cuentas). Pura; céntimos enteros.
// Solo quien paga o quien cobra puede registrarlo (la RPC create_settlement lo vuelve a comprobar).

import { MAX_EXPENSE_CENTS, isValidDate } from './expenseForm.ts'
import { parseEurosToCents } from './money.ts'

export interface SettlementDraft {
  amountText: string
  /** AAAA-MM-DD (fecha local). */
  date: string
  fromUser: string
  toUser: string
  memberIds: readonly string[]
  me: string
}

export interface ValidSettlement {
  amountCents: number
  date: string
  fromUser: string
  toUser: string
}

export type SettlementErrors = Partial<{
  amount: 'required' | 'invalid' | 'zero' | 'tooLarge'
  date: 'invalid'
  people: 'same' | 'notMember' | 'notInvolved'
}>

export function validateSettlement(draft: SettlementDraft): { ok: true; value: ValidSettlement } | { ok: false; errors: SettlementErrors } {
  const errors: SettlementErrors = {}
  const text = draft.amountText.trim()
  const cents = text ? parseEurosToCents(text) : null
  if (!text) errors.amount = 'required'
  else if (cents === null) errors.amount = 'invalid'
  else if (cents === 0) errors.amount = 'zero'
  else if (cents > MAX_EXPENSE_CENTS) errors.amount = 'tooLarge'

  if (!isValidDate(draft.date)) errors.date = 'invalid'

  const members = new Set(draft.memberIds)
  if (draft.fromUser === draft.toUser) errors.people = 'same'
  else if (!members.has(draft.fromUser) || !members.has(draft.toUser)) errors.people = 'notMember'
  else if (draft.me !== draft.fromUser && draft.me !== draft.toUser) errors.people = 'notInvolved'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { amountCents: cents!, date: draft.date, fromUser: draft.fromUser, toUser: draft.toUser } }
}
