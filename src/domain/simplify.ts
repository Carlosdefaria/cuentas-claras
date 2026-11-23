// Simplificación de deudas (PRD §6.4): pagos mínimos para dejar el grupo en paz. Pura y en céntimos enteros.
//
// Voraz: en cada paso, quien más debe paga a quien más le deben el menor de los dos importes. Cada paso deja al menos
// a uno de los dos en 0, así que salen como mucho n−1 pagos (n = personas con saldo distinto de 0). Los empates se
// deciden por el id menor, para que todos los móviles vean la misma lista.

import type { Settlement } from './balances'

export function simplifyDebts(balances: ReadonlyMap<string, number>): Settlement[] {
  let total = 0
  for (const [id, cents] of balances) {
    if (!Number.isSafeInteger(cents)) throw new Error(`Saldo no entero de ${id}: ${cents}`)
    total += cents
  }
  if (total !== 0) throw new Error(`Los saldos suman ${total} y deberían sumar 0`)

  const ids = [...balances.keys()].sort()
  const debt = new Map(ids.filter((id) => balances.get(id)! < 0).map((id) => [id, -balances.get(id)!]))
  const credit = new Map(ids.filter((id) => balances.get(id)! > 0).map((id) => [id, balances.get(id)!]))

  // El mayor importe; en empate, el id menor (los Map conservan el orden alfabético de inserción).
  const largest = (m: Map<string, number>) => {
    let best: string | null = null
    for (const [id, cents] of m) if (best === null || cents > m.get(best)!) best = id
    return best
  }

  const payments: Settlement[] = []
  for (;;) {
    const from = largest(debt)
    const to = largest(credit)
    if (from === null || to === null) break
    const amountCents = Math.min(debt.get(from)!, credit.get(to)!)
    payments.push({ fromUser: from, toUser: to, amountCents })
    const restDebt = debt.get(from)! - amountCents
    const restCredit = credit.get(to)! - amountCents
    if (restDebt === 0) debt.delete(from)
    else debt.set(from, restDebt)
    if (restCredit === 0) credit.delete(to)
    else credit.set(to, restCredit)
  }
  return payments
}
