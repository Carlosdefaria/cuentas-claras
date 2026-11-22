// Papel de talón para grupos y personas (DESIGN.md: un talón por persona). Determinista, sin estado.

export const TALONES = ['menta', 'salmon', 'cielo', 'mantequilla', 'lila'] as const
export type Talon = (typeof TALONES)[number]

/** Talón estable para un id (grupo): el mismo grupo siempre tiene el mismo color. */
export function talonFor(id: string): Talon {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TALONES[h % TALONES.length]
}

/** Talones de los miembros por orden de llegada: dos seguidos nunca comparten color. */
export function memberTalones<T>(members: readonly T[]): Talon[] {
  return members.map((_, i) => TALONES[i % TALONES.length])
}

/** Inicial para el círculo de una persona (maneja acentos y emojis como un solo carácter). */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0]
  return first ? first.toLocaleUpperCase('es') : '?'
}
