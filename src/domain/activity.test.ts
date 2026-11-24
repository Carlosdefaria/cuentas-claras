import { describe, expect, it } from 'vitest'
import { parseActivity } from './activity'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const E = '33333333-3333-4333-8333-333333333333'

describe('parseActivity', () => {
  it('gasto añadido', () => {
    expect(parseActivity('expense_created', { expense_id: E, description: 'Cena', amount_cents: 3600 })).toEqual({
      kind: 'expense_created',
      expenseId: E,
      description: 'Cena',
      amountCents: 3600,
    })
  })

  it('gasto editado: cambios en orden fijo (importe, concepto, pagador, fecha, participantes)', () => {
    const event = parseActivity('expense_updated', {
      expense_id: E,
      description: 'Cena en Casa Pepe',
      amount_cents: 4250,
      changes: {
        participants: { added: [B], removed: [A] },
        expense_date: { from: '2026-11-20', to: '2026-11-21' },
        paid_by: { from: A, to: B },
        description: { from: 'Cena', to: 'Cena en Casa Pepe' },
        amount_cents: { from: 3600, to: 4250 },
      },
    })
    expect(event).toEqual({
      kind: 'expense_updated',
      expenseId: E,
      description: 'Cena en Casa Pepe',
      amountCents: 4250,
      changes: [
        { field: 'amount', from: 3600, to: 4250 },
        { field: 'description', from: 'Cena', to: 'Cena en Casa Pepe' },
        { field: 'paidBy', from: A, to: B },
        { field: 'date', from: '2026-11-20', to: '2026-11-21' },
        { field: 'participants', added: [B], removed: [A] },
      ],
    })
  })

  it('cambio de tipo de reparto', () => {
    const event = parseActivity('expense_updated', {
      expense_id: E, description: 'x', amount_cents: 1, changes: { split_type: { from: 'equal', to: 'percent' }, split: true },
    })
    expect(event.kind === 'expense_updated' && event.changes).toEqual([{ field: 'splitType', from: 'equal', to: 'percent' }, { field: 'split' }])
    const bad = parseActivity('expense_updated', { expense_id: E, description: 'x', amount_cents: 1, changes: { split_type: { from: 'equal', to: 'raro' } } })
    expect(bad.kind === 'expense_updated' && bad.changes).toEqual([])
  })

  it('reparto distinto con las mismas personas (Fase 2) se marca como «split»', () => {
    const event = parseActivity('expense_updated', { expense_id: E, description: 'x', amount_cents: 1, changes: { split: true } })
    expect(event.kind === 'expense_updated' && event.changes).toEqual([{ field: 'split' }])
  })

  it('gasto borrado, con quién lo pagó', () => {
    expect(parseActivity('expense_deleted', { expense_id: E, description: 'Taxi', amount_cents: 1840, paid_by: B })).toEqual({
      kind: 'expense_deleted',
      expenseId: E,
      description: 'Taxi',
      amountCents: 1840,
      paidBy: B,
    })
  })

  it('pago registrado y pago borrado', () => {
    const payload = { settlement_id: E, from_user: A, to_user: B, amount_cents: 1250 }
    expect(parseActivity('settlement_created', payload)).toEqual({ kind: 'settlement_created', settlementId: E, fromUser: A, toUser: B, amountCents: 1250 })
    expect(parseActivity('settlement_deleted', payload)).toEqual({ kind: 'settlement_deleted', settlementId: E, fromUser: A, toUser: B, amountCents: 1250 })
  })

  it('miembro que se une y grupo creado', () => {
    expect(parseActivity('member_joined', {})).toEqual({ kind: 'member_joined' })
    expect(parseActivity('group_created', { name: 'Lisboa' })).toEqual({ kind: 'group_created', name: 'Lisboa' })
  })

  it('miembro quitado y grupo borrado', () => {
    expect(parseActivity('member_removed', { user_id: B, name: 'Bea' })).toEqual({ kind: 'member_removed', userId: B, name: 'Bea' })
    expect(parseActivity('member_removed', { user_id: B })).toEqual({ kind: 'member_removed', userId: B, name: null })
    expect(parseActivity('member_removed', { name: 'Bea' })).toEqual({ kind: 'unknown' })
    expect(parseActivity('member_removed', null)).toEqual({ kind: 'unknown' })
    expect(parseActivity('group_deleted', { name: 'Lisboa' })).toEqual({ kind: 'group_deleted', name: 'Lisboa' })
    expect(parseActivity('group_deleted', null)).toEqual({ kind: 'group_deleted', name: null })
  })

  it('datos raros o tipos desconocidos no rompen: se ignoran los campos malos o queda «unknown»', () => {
    expect(parseActivity('expense_created', null)).toEqual({ kind: 'unknown' })
    expect(parseActivity('expense_created', { description: 'x' })).toEqual({ kind: 'unknown' })
    expect(parseActivity('expense_created', { expense_id: E, description: 'x', amount_cents: 1.5 })).toEqual({ kind: 'unknown' })
    expect(parseActivity('settlement_created', { amount_cents: 1 })).toEqual({ kind: 'unknown' })
    expect(parseActivity('settlement_deleted', { settlement_id: E, from_user: A, amount_cents: 1 })).toEqual({ kind: 'unknown' })
    expect(parseActivity('algo_nuevo', {})).toEqual({ kind: 'unknown' })
    const event = parseActivity('expense_updated', {
      expense_id: E,
      description: 'x',
      amount_cents: 100,
      changes: { amount_cents: { from: '36', to: 4250 }, participants: { added: 'B', removed: [A, 7] }, paid_by: { from: A, to: B } },
    })
    expect(event.kind === 'expense_updated' && event.changes).toEqual([
      { field: 'paidBy', from: A, to: B },
      { field: 'participants', added: [], removed: [A] },
    ])
    expect(parseActivity('group_created', {})).toEqual({ kind: 'group_created', name: null })
  })
})
