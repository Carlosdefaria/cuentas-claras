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

/**
 * Reparte `totalCents` por porcentajes en puntos básicos (33,33 % = 3333; tienen que sumar 10000).
 * Cada cuota es la parte entera de total × bp / 10000; los céntimos sobrantes van de 1 en 1 a quien tenga el mayor
 * resto, y en empate al id menor. Todo en enteros: la suma es siempre exactamente `totalCents` y cada cuota se queda a
 * menos de 1 céntimo de la exacta.
 */
export function splitByPercent(totalCents: number, basisPoints: ReadonlyMap<string, number>): Map<string, number> {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error(`Importe no válido: ${totalCents}`)
  if (basisPoints.size === 0) throw new Error('El reparto necesita al menos un participante')
  let sumBp = 0
  for (const [id, bp] of basisPoints) {
    if (!Number.isSafeInteger(bp) || bp < 0 || bp > 10000) throw new Error(`Porcentaje no válido de ${id}: ${bp}`)
    sumBp += bp
  }
  if (sumBp !== 10000) throw new Error(`Los porcentajes suman ${sumBp / 100} % y deberían sumar 100 %`)

  const rows = [...basisPoints].map(([id, bp]) => ({ id, share: Math.floor((totalCents * bp) / 10000), rest: (totalCents * bp) % 10000 }))
  let leftover = totalCents - rows.reduce((a, r) => a + r.share, 0)
  const byRest = [...rows].sort((a, b) => b.rest - a.rest || compareIds(a.id, b.id))
  for (const r of byRest) {
    if (leftover === 0) break
    r.share += 1
    leftover -= 1
  }
  return new Map([...rows].sort((a, b) => compareIds(a.id, b.id)).map((r) => [r.id, r.share]))
}
