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

const PERCENT_RE = /^(\d{1,3})(?:[.,](\d{1,2}))?$/

/** «33,33» → 3333 puntos básicos (hasta 2 decimales, de 0 a 100 %). null si no es válido. */
export function parsePercentToBasisPoints(input: string): number | null {
  const match = PERCENT_RE.exec(input.trim())
  if (!match) return null
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return bp <= 10000 ? bp : null
}

/** 3333 → «33,33»; 1250 → «12,5»; 4000 → «40». Inversa de parsePercentToBasisPoints. */
export function basisPointsToText(bp: number): string {
  if (!Number.isSafeInteger(bp) || bp < 0) throw new Error(`Porcentaje no válido: ${bp}`)
  const whole = Math.floor(bp / 100)
  const rest = bp % 100
  if (rest === 0) return String(whole)
  return `${whole},${String(rest).padStart(2, '0').replace(/0$/, '')}`
}
