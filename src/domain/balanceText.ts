// Lectura de un saldo (positivo = le deben) y total de mis grupos.

export type BalanceKind = 'owed' | 'owes' | 'settled'

export function balanceKind(cents: number): BalanceKind {
  return cents > 0 ? 'owed' : cents < 0 ? 'owes' : 'settled'
}

/** Mi saldo total sumando el de cada grupo. */
export function totalBalance(balances: readonly number[]): number {
  return balances.reduce((acc, c) => {
    if (!Number.isSafeInteger(c)) throw new Error(`Saldo no entero: ${c}`)
    return acc + c
  }, 0)
}
