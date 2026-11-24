// Círculo de una persona con su inicial en su talón; quien ya no está en el grupo (RF-11), en gris (`papel-hondo`).

import { es } from '../../i18n/es'
import { initialOf } from '../../lib/talon'
import type { Person } from '../../lib/people'
import { TALON_BG } from '../../components/talonBg'

export function PersonDot({ person, size = 'md' }: { person: Person | undefined; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-7.5 text-[0.8125rem]' : 'size-8 text-[0.8125rem]'
  const paper = !person ? 'bg-papel-hondo' : person.gone ? 'bg-papel-hondo text-tinta-tenue' : TALON_BG[person.talon]
  return (
    <span aria-hidden className={`flex ${dims} flex-none items-center justify-center rounded-full font-bold ${paper}`}>
      {person ? initialOf(person.name) : '?'}
    </span>
  )
}

/** « · ya no está» detrás del nombre de quien ya no está en el grupo (en gastos, pagos y actividad). */
export function GoneMark({ person }: { person: Person | undefined }) {
  if (!person?.gone) return null
  return <span className="font-normal text-tinta-tenue"> · {es.groups.manage.goneLower}</span>
}
