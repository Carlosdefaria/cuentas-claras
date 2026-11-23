import { describe, expect, it } from 'vitest'
import { MAX_EXPENSE_CENTS, draftFromExpense, isUnchanged, remainderRecipients, sharesFor, splitSummary, validateExpense, type ExpenseDraft } from './expenseForm'
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
        splitType: 'equal',
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
      splitType: 'equal',
      amounts: {},
      percents: {},
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

describe('repartos por importes y por porcentajes', () => {
  const base = (over: Partial<ExpenseDraft>): ExpenseDraft => ({
    amountText: '120',
    description: 'Alquiler',
    paidBy: 'a',
    participants: [],
    date: '2026-11-23',
    memberIds: ['a', 'b', 'c', 'd'],
    ...over,
  })

  it('por importes: cada uno lo suyo; quien deja 0 o vacío no participa', () => {
    const r = validateExpense(base({ splitType: 'amounts', amounts: { a: '40', b: '40,00', c: '40', d: '' } }))
    expect(r).toEqual({
      ok: true,
      value: {
        amountCents: 12000,
        description: 'Alquiler',
        paidBy: 'a',
        date: '2026-11-23',
        splitType: 'amounts',
        shares: [
          { userId: 'a', amountCents: 4000 },
          { userId: 'b', amountCents: 4000 },
          { userId: 'c', amountCents: 4000 },
        ],
      },
    })
  })

  it('por importes: si no suman el total, error de reparto; y la diferencia se ve en vivo', () => {
    const d = base({ splitType: 'amounts', amounts: { a: '40', b: '40', c: '20', d: '16,80' } })
    expect(validateExpense(d)).toEqual({ ok: false, errors: { split: 'amountsMismatch' } })
    expect(splitSummary(d)).toEqual({ kind: 'amounts', assignedCents: 11680, totalCents: 12000, diffCents: 320 })
    expect(splitSummary({ ...d, amounts: { ...d.amounts, d: '20' } })).toEqual({ kind: 'amounts', assignedCents: 12000, totalCents: 12000, diffCents: 0 })
    expect(splitSummary({ ...d, amounts: { ...d.amounts, d: '25' } })).toMatchObject({ diffCents: -500 }) // sobran 5 €
  })

  it('por importes: un importe mal escrito marca su fila; nadie con importe → faltan participantes', () => {
    expect(validateExpense(base({ splitType: 'amounts', amounts: { a: '12,345', b: '107,655' } }))).toEqual({
      ok: false,
      errors: { shares: { a: 'invalid', b: 'invalid' } },
    })
    expect(validateExpense(base({ splitType: 'amounts', amounts: { a: '0', b: '' } }))).toEqual({ ok: false, errors: { participants: 'required' } })
    expect(validateExpense(base({ splitType: 'amounts', amounts: { x: '120' } }))).toEqual({ ok: false, errors: { participants: 'invalid' } })
  })

  it('por porcentajes: 100 € al 33,33 / 33,33 / 33,34 %', () => {
    const r = validateExpense(base({ amountText: '100', splitType: 'percent', percents: { a: '33,33', b: '33.33', c: '33,34' } }))
    expect(r.ok && r.value).toMatchObject({
      splitType: 'percent',
      shares: [
        { userId: 'a', amountCents: 3333, percentBp: 3333 },
        { userId: 'b', amountCents: 3333, percentBp: 3333 },
        { userId: 'c', amountCents: 3334, percentBp: 3334 },
      ],
    })
  })

  it('por porcentajes: tienen que sumar 100 % (resumen en vivo en puntos básicos)', () => {
    const d = base({ splitType: 'percent', percents: { a: '40', b: '30', c: '20', d: '5' } })
    expect(validateExpense(d)).toEqual({ ok: false, errors: { split: 'percentMismatch' } })
    expect(splitSummary(d)).toEqual({ kind: 'percent', assignedBp: 9500, diffBp: 500 })
    expect(validateExpense(base({ splitType: 'percent', percents: { a: '100,001' } }))).toEqual({ ok: false, errors: { shares: { a: 'invalid' } } })
  })

  it('a partes iguales no tiene resumen', () => {
    expect(splitSummary(base({ participants: ['a'] }))).toBeNull()
  })

  it('editar: se recuperan el tipo, los importes y los porcentajes guardados, y sin tocar nada no hay cambios', () => {
    const saved = {
      amountCents: 10000,
      description: 'Alquiler',
      paidBy: 'a',
      date: '2026-11-23',
      splitType: 'percent' as const,
      shares: [
        { userId: 'b', amountCents: 3333, percentBp: 3333 },
        { userId: 'a', amountCents: 3333, percentBp: 3333 },
        { userId: 'c', amountCents: 3334, percentBp: 3334 },
      ],
    }
    const d = draftFromExpense(saved, ['a', 'b', 'c', 'd'])
    expect(d).toMatchObject({ splitType: 'percent', percents: { a: '33,33', b: '33,33', c: '33,34' }, participants: ['a', 'b', 'c'] })
    const r = validateExpense(d)
    expect(r.ok && isUnchanged(saved, r.value)).toBe(true)
    // Mismos céntimos con otro tipo de reparto: sí es un cambio.
    const asAmounts = validateExpense({ ...d, splitType: 'amounts', amounts: { a: '33,33', b: '33,33', c: '33,34' } })
    expect(asAmounts.ok && isUnchanged(saved, asAmounts.value)).toBe(false)
    const amountsSaved = { ...saved, splitType: 'amounts' as const, shares: saved.shares.map(({ userId, amountCents }) => ({ userId, amountCents })) }
    expect(draftFromExpense(amountsSaved, ['a', 'b', 'c', 'd'])).toMatchObject({ splitType: 'amounts', amounts: { a: '33,33', b: '33,33', c: '33,34' } })
  })
})
