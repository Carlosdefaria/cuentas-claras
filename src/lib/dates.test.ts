import { describe, expect, it } from 'vitest'
import { dayLabel, groupByDay, localDateOf, localToday, shortDay, timeOf, whenLabel } from './dates'

describe('localToday', () => {
  it('usa la fecha local, no UTC', () => {
    // 23:30 del 22 de noviembre en hora local
    expect(localToday(new Date(2026, 10, 22, 23, 30))).toBe('2026-11-22')
    expect(localToday(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })
})

describe('dayLabel', () => {
  const today = '2026-11-22'
  it.each([
    ['2026-11-22', 'Hoy · 22 nov'],
    ['2026-11-21', 'Ayer · 21 nov'],
    ['2026-11-20', '20 nov'],
    ['2026-03-01', '1 mar'],
    ['2025-12-31', '31 dic 2025'],
    ['2026-11-23', '23 nov'],
  ])('%s → %s', (date, label) => {
    expect(dayLabel(date, today)).toBe(label)
  })

  it('Ayer cruzando de mes y de año', () => {
    expect(dayLabel('2026-02-28', '2026-03-01')).toBe('Ayer · 28 feb')
    expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Ayer · 31 dic 2025')
  })
})

describe('groupByDay', () => {
  it('agrupa conservando el orden de entrada (ya viene ordenado de la BD)', () => {
    const items = [
      { id: 1, date: '2026-11-22' },
      { id: 2, date: '2026-11-22' },
      { id: 3, date: '2026-11-21' },
    ]
    expect(groupByDay(items, (i) => i.date)).toEqual([
      { date: '2026-11-22', items: [items[0], items[1]] },
      { date: '2026-11-21', items: [items[2]] },
    ])
  })
})

describe('fecha y hora locales de un instante (actividad)', () => {
  it('localDateOf da el día local y timeOf la hora local HH:MM', () => {
    const d = new Date(2026, 10, 23, 21, 4)
    expect(localDateOf(d.toISOString())).toBe('2026-11-23')
    expect(timeOf(d.toISOString())).toBe('21:04')
  })
})

describe('whenLabel', () => {
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).toISOString()
  it('hoy y ayer con la hora; antes, el día', () => {
    expect(whenLabel(at(23, 21, 14), '2026-11-23')).toBe('hoy a las 21:14')
    expect(whenLabel(at(22, 9, 5), '2026-11-23')).toBe('ayer a las 09:05')
    expect(whenLabel(at(20, 9, 5), '2026-11-23')).toBe('el 20 nov')
    expect(whenLabel(new Date(2025, 11, 31, 10, 0).toISOString(), '2026-01-02')).toBe('el 31 dic 2025')
  })
})

describe('shortDay', () => {
  it('sin año si es del mismo año; con año si no', () => {
    expect(shortDay('2026-11-20', '2026-11-23')).toBe('20 nov')
    expect(shortDay('2025-12-31', '2026-01-02')).toBe('31 dic 2025')
  })
})
