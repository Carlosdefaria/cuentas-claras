import { describe, expect, it } from 'vitest'
import { MAX_EXPENSE_CENTS, draftFromExpense, isUnchanged, remainderRecipients, sharesFor, validateExpense, type ExpenseDraft } from './expenseForm'
import { mulberry32, sum } from './testUtils'

const members = ['c', 'a', 'd', 'b']
const draft = (over: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  amountText: '23,50',
  description: '  Taxi al hotel ',
  paidBy: 'c',
  participants: ['c', 'a', 'd', 'b'],
  date: '2026-11-22',
  memberIds: members,
  ...over,
})

describe('sharesFor (reparto igual, resto determinista por id)', () => {
  it('23,50 € entre 4 → 5,88 · 5,88 · 5,87 · 5,87 a los dos menores ids', () => {
    expect(sharesFor(2350, ['c', 'a', 'd', 'b'])).toEqual([
      { userId: 'a', amountCents: 588 },
      { userId: 'b', amountCents: 588 },
      { userId: 'c', amountCents: 587 },
      { userId: 'd', amountCents: 587 },
    ])
    expect(remainderRecipients(2350, ['c', 'a', 'd', 'b'])).toEqual(['a', 'b'])
  })

  it('sin resto no hay destinatarios de céntimos', () => {
    expect(remainderRecipients(900, ['a', 'b', 'c'])).toEqual([])
  })

  it('propiedad: suma exacta y diferencia máxima de 1 céntimo', () => {
    const rnd = mulberry32(42)
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 12)
      const ids = Array.from({ length: n }, (_, k) => `u${k}`)
      const amount = 1 + Math.floor(rnd() * MAX_EXPENSE_CENTS)
      const shares = sharesFor(amount, ids)
      expect(sum(shares.map((s) => s.amountCents))).toBe(amount)
      const values = shares.map((s) => s.amountCents)
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
      expect(remainderRecipients(amount, ids)).toHaveLength(amount % n)
    }
  })
})

describe('validateExpense', () => {
  it('borrador correcto → importe en céntimos, concepto recortado y cuotas', () => {
    const r = validateExpense(draft())
    expect(r).toEqual({
      ok: true,
      value: {
        amountCents: 2350,
        description: 'Taxi al hotel',
        paidBy: 'c',
        date: '2026-11-22',
        shares: sharesFor(2350, ['a', 'b', 'c', 'd']),
      },
    })
  })

  it.each([
    ['', 'required'],
    ['  ', 'required'],
    ['abc', 'invalid'],
    ['12,345', 'invalid'],
    ['-3', 'invalid'],
    ['0', 'zero'],
    ['0,00', 'zero'],
    ['1000000,01', 'tooLarge'],
  ] as const)('importe %j → %s', (amountText, error) => {
    const r = validateExpense(draft({ amountText }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.amount).toBe(error)
  })

  it('1.000.000,00 € es el máximo admitido', () => {
    expect(validateExpense(draft({ amountText: '1000000' })).ok).toBe(true)
  })

  it('concepto obligatorio y de hasta 200 caracteres', () => {
    const empty = validateExpense(draft({ description: '   ' }))
    const long = validateExpense(draft({ description: 'x'.repeat(201) }))
    expect(!empty.ok && empty.errors.description).toBe('required')
    expect(!long.ok && long.errors.description).toBe('tooLong')
    expect(validateExpense(draft({ description: 'x'.repeat(200) })).ok).toBe(true)
  })

  it('al menos un participante, todos del grupo y sin repetir', () => {
    const none = validateExpense(draft({ participants: [] }))
    const outsider = validateExpense(draft({ participants: ['a', 'z'] }))
    expect(!none.ok && none.errors.participants).toBe('required')
    expect(!outsider.ok && outsider.errors.participants).toBe('invalid')
    const dup = validateExpense(draft({ participants: ['a', 'a', 'b'] }))
    expect(dup.ok && dup.value.shares.map((s) => s.userId)).toEqual(['a', 'b'])
  })

  it('el pagador debe ser del grupo (puede no participar)', () => {
    const r = validateExpense(draft({ paidBy: 'z' }))
    expect(!r.ok && r.errors.paidBy).toBe('invalid')
    const noPart = validateExpense(draft({ paidBy: 'c', participants: ['a', 'b'] }))
    expect(noPart.ok).toBe(true)
    const missing = validateExpense(draft({ paidBy: null }))
    expect(!missing.ok && missing.errors.paidBy).toBe('required')
  })

  it.each(['', '2026-13-01', '2026-02-30', '22/11/2026'])('fecha %j no válida', (date) => {
    const r = validateExpense(draft({ date }))
    expect(!r.ok && r.errors.date).toBe('invalid')
  })

  it('devuelve todos los errores a la vez', () => {
    const r = validateExpense(draft({ amountText: '', description: '', participants: [] }))
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['amount', 'description', 'participants'])
  })
})

describe('editar: draftFromExpense e isUnchanged', () => {
  const original = {
    amountCents: 4250,
    description: 'Cena en Casa Pepe',
    paidBy: 'a',
    date: '2026-11-21',
    shares: [
      { userId: 'c', amountCents: 1416 },
      { userId: 'a', amountCents: 1417 },
      { userId: 'b', amountCents: 1417 },
    ],
  }

  it('rellena el formulario con el gasto tal cual (importe como texto, participantes = quienes tienen cuota)', () => {
    expect(draftFromExpense(original, members)).toEqual({
      amountText: '42,50',
      description: 'Cena en Casa Pepe',
      paidBy: 'a',
      participants: ['a', 'b', 'c'],
      date: '2026-11-21',
      memberIds: members,
    })
  })

  it('sin tocar nada, validar el borrador da el mismo gasto: no hay cambios', () => {
    const result = validateExpense(draftFromExpense(original, members))
    expect(result.ok).toBe(true)
    if (result.ok) expect(isUnchanged(original, result.value)).toBe(true)
  })

  it('cualquier cambio de importe, concepto, pagador, fecha o participantes cuenta', () => {
    const base = draftFromExpense(original, members)
    const changed: Partial<ExpenseDraft>[] = [
      { amountText: '42,51' },
      { description: 'Cena' },
      { paidBy: 'b' },
      { date: '2026-11-22' },
      { participants: ['a', 'b'] },
      { participants: ['a', 'b', 'c', 'd'] },
    ]
    for (const over of changed) {
      const result = validateExpense({ ...base, ...over })
      expect(result.ok).toBe(true)
      if (result.ok) expect(isUnchanged(original, result.value)).toBe(false)
    }
  })

  it('espacios de más en el concepto o «42,5» en vez de «42,50» no son cambios', () => {
    const result = validateExpense({ ...draftFromExpense(original, members), description: ' Cena en Casa Pepe  ', amountText: '42,5' })
    expect(result.ok && isUnchanged(original, result.value)).toBe(true)
  })

  it('un participante que ya no es miembro hace que el borrador no valide (hay que quitarlo)', () => {
    const result = validateExpense(draftFromExpense({ ...original, shares: [...original.shares, { userId: 'x', amountCents: 0 }] }, members))
    expect(result.ok).toBe(false)
  })
})
