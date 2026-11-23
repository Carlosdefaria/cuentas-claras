// Dinero: siempre céntimos enteros. Los euros solo existen como texto en la UI.

const EUROS_RE = /^(\d+)(?:[.,](\d{1,2}))?$/

/**
 * Convierte lo que escribe el usuario ("12,34", "12.34", "12") a céntimos.
 * Devuelve null si el texto no es un importe válido (vacío, negativo, >2 decimales…).
 * No usa aritmética de coma flotante: parte entera y decimal se tratan por separado.
 */
export function parseEurosToCents(input: string): number | null {
  const match = EUROS_RE.exec(input.trim())
  if (!match) return null
  const [, euros, decimals = ''] = match
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

const eurFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

/** Formatea céntimos como euros para mostrar ("12,34 €"). */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Importe en céntimos no válido: ${cents}`)
  return eurFormatter.format(cents / 100)
}

/** Céntimos como texto para un campo de importe («42,50»; «42» si son euros enteros). Inversa de parseEurosToCents. */
export function centsToInputText(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Importe en céntimos no válido: ${cents}`)
  const euros = Math.floor(cents / 100)
  const rest = cents % 100
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`
}
