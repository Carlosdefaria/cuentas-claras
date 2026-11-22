// Personas de un grupo para pintar gastos y saldos: nombre, cómo se muestra («tú») y su talón (orden de llegada).

import type { Member } from './groups'
import { memberTalones, type Talon } from './talon'

export interface Person {
  id: string
  name: string
  isMe: boolean
  talon: Talon
}

export function peopleOf(members: readonly Member[], me: string | null): Map<string, Person> {
  const talones = memberTalones(members)
  return new Map(members.map((m, i) => [m.userId, { id: m.userId, name: m.name, isMe: m.userId === me, talon: talones[i] }]))
}
