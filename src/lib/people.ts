// Personas de un grupo para pintar gastos y saldos: nombre, cómo se muestra («tú»), su talón (orden de llegada, también
// de quien ya no está, para que nadie cambie de color) y si ya no está (`gone`).

import type { Member } from './groups'
import { memberTalones, type Talon } from './talon'

export interface Person {
  id: string
  name: string
  isMe: boolean
  talon: Talon
  /** Ya no está en el grupo (RF-11): aparece en su historial, pero no en los formularios. */
  gone: boolean
}

export function peopleOf(members: readonly Member[], me: string | null): Map<string, Person> {
  const talones = memberTalones(members)
  return new Map(members.map((m, i) => [m.userId, { id: m.userId, name: m.name, isMe: m.userId === me, talon: talones[i], gone: m.removedAt !== null }]))
}
