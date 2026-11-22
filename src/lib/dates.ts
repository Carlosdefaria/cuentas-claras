// Fechas de gastos: AAAA-MM-DD en fecha local (el día en que se gastó, sin zona horaria).

import { es } from '../i18n/es'

const pad = (n: number) => String(n).padStart(2, '0')

/** Hoy en fecha local (no UTC: a las 23:30 sigue siendo hoy). */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

const short = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const withYear = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** «Hoy · 22 nov», «Ayer · 21 nov», «20 nov» o, de otro año, «31 dic 2025». */
export function dayLabel(iso: string, today: string): string {
  const diff = Math.round((toUtc(today) - toUtc(iso)) / 86_400_000)
  const fmt = iso.slice(0, 4) === today.slice(0, 4) ? short : withYear
  const date = fmt.format(toUtc(iso)).replace(/\./g, '')
  if (diff === 0) return `${es.dates.today} · ${date}`
  if (diff === 1) return `${es.dates.yesterday} · ${date}`
  return date
}

/** Agrupa elementos consecutivos del mismo día (la lista ya viene ordenada). */
export function groupByDay<T>(items: readonly T[], dateOf: (item: T) => string): { date: string; items: T[] }[] {
  const out: { date: string; items: T[] }[] = []
  for (const item of items) {
    const date = dateOf(item)
    const last = out.at(-1)
    if (last && last.date === date) last.items.push(item)
    else out.push({ date, items: [item] })
  }
  return out
}
