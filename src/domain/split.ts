// Reparto igual de un importe entre participantes.

/** Orden por código de carácter: igual en todos los navegadores y en Node (sin depender del locale). */
export const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Reparte `totalCents` a partes iguales. Los céntimos sobrantes se asignan de 1 en 1
 * a los participantes por orden ascendente de id (regla determinista del PRD §6.2).
 * La suma de las cuotas es siempre exactamente `totalCents`.
 */
export function splitEqual(totalCents: number, participantIds: readonly string[]): Map<string, number> {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error(`Importe no válido: ${totalCents}`)
  }
  if (participantIds.length === 0) throw new Error('El reparto necesita al menos un participante')
  const sorted = [...participantIds].sort(compareIds)
  if (new Set(sorted).size !== sorted.length) throw new Error('Participantes duplicados en el reparto')

  const base = Math.floor(totalCents / sorted.length)
  const remainder = totalCents % sorted.length
  return new Map(sorted.map((id, i) => [id, base + (i < remainder ? 1 : 0)]))
}
