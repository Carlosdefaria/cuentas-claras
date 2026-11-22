// Círculo de una persona con su inicial en su talón.

import { initialOf } from '../../lib/talon'
import type { Person } from '../../lib/people'
import { TALON_BG } from '../../components/talonBg'

export function PersonDot({ person, size = 'md' }: { person: Person | undefined; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-7.5 text-[0.8125rem]' : 'size-8 text-[0.8125rem]'
  return (
    <span aria-hidden className={`flex ${dims} flex-none items-center justify-center rounded-full font-bold ${person ? TALON_BG[person.talon] : 'bg-papel-hondo'}`}>
      {person ? initialOf(person.name) : '?'}
    </span>
  )
}
