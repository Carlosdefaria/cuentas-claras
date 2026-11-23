import { describe, expect, it } from 'vitest'
import { validateSettlement } from './settlementForm'
import { MAX_EXPENSE_CENTS } from './expenseForm'

const ok = { amountText: '12,50', date: '2026-11-23', fromUser: 'a', toUser: 'b', memberIds: ['a', 'b', 'c'], me: 'a' }

describe('validateSettlement', () => {
  it('un pago válido devuelve céntimos', () => {
    expect(validateSettlement(ok)).toEqual({ ok: true, value: { amountCents: 1250, date: '2026-11-23', fromUser: 'a', toUser: 'b' } })
  })

  it('importe: vacío, mal escrito, 0 o por encima del tope', () => {
    expect(validateSettlement({ ...ok, amountText: ' ' })).toEqual({ ok: false, errors: { amount: 'required' } })
    expect(validateSettlement({ ...ok, amountText: '1,234' })).toEqual({ ok: false, errors: { amount: 'invalid' } })
    expect(validateSettlement({ ...ok, amountText: '0' })).toEqual({ ok: false, errors: { amount: 'zero' } })
    expect(validateSettlement({ ...ok, amountText: String(MAX_EXPENSE_CENTS / 100 + 1) })).toEqual({ ok: false, errors: { amount: 'tooLarge' } })
  })

  it('fecha no válida', () => {
    expect(validateSettlement({ ...ok, date: '2026-02-30' })).toEqual({ ok: false, errors: { date: 'invalid' } })
  })

  it('personas: distintas, del grupo, y tú tienes que ser quien paga o quien cobra', () => {
    expect(validateSettlement({ ...ok, toUser: 'a' })).toEqual({ ok: false, errors: { people: 'same' } })
    expect(validateSettlement({ ...ok, toUser: 'x' })).toEqual({ ok: false, errors: { people: 'notMember' } })
    expect(validateSettlement({ ...ok, fromUser: 'b', toUser: 'c' })).toEqual({ ok: false, errors: { people: 'notInvolved' } })
    expect(validateSettlement({ ...ok, fromUser: 'b', toUser: 'a' }).ok).toBe(true) // quien cobra también puede
  })
})
