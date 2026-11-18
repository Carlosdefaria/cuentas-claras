// Cálculo de saldos. Los saldos no se guardan en BD: se derivan de gastos, cuotas y pagos.
//
// saldo = lo pagado en gastos − sus cuotas + pagos realizados − pagos recibidos
// Positivo = le deben; negativo = debe. La suma del grupo es siempre 0.

export interface Expense {
  id: string
  paidBy: string
  amountCents: number
  deletedAt: string | null
}

export interface ExpenseShare {
  expenseId: string
  userId: string
  amountCents: number
}

/** Pago de `fromUser` a `toUser` para saldar deuda. */
export interface Settlement {
  fromUser: string
  toUser: string
  amountCents: number
}

export interface BalanceInput {
  /** Miembros actuales: aparecen en el resultado aunque su saldo sea 0. */
  memberIds: readonly string[]
  expenses: readonly Expense[]
  shares: readonly ExpenseShare[]
  settlements: readonly Settlement[]
}

function assertCents(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`Importe no entero en ${what}: ${value}`)
}

/** Devuelve el saldo en céntimos de cada persona del grupo. */
export function computeBalances({ memberIds, expenses, shares, settlements }: BalanceInput): Map<string, number> {
  const balances = new Map<string, number>(memberIds.map((id) => [id, 0]))
  const add = (userId: string, cents: number) => balances.set(userId, (balances.get(userId) ?? 0) + cents)

  const expensesById = new Map(expenses.map((e) => [e.id, e]))
  const sharedByExpense = new Map<string, number>()

  for (const share of shares) {
    const expense = expensesById.get(share.expenseId)
    if (!expense) throw new Error(`Cuota de un gasto inexistente: ${share.expenseId}`)
    assertCents(share.amountCents, `cuota del gasto ${share.expenseId}`)
    if (expense.deletedAt !== null) continue
    add(share.userId, -share.amountCents)
    sharedByExpense.set(expense.id, (sharedByExpense.get(expense.id) ?? 0) + share.amountCents)
  }

  for (const expense of expenses) {
    if (expense.deletedAt !== null) continue
    assertCents(expense.amountCents, `gasto ${expense.id}`)
    const shared = sharedByExpense.get(expense.id) ?? 0
    if (shared !== expense.amountCents) {
      throw new Error(`Las cuotas del gasto ${expense.id} suman ${shared} y el importe es ${expense.amountCents}`)
    }
    add(expense.paidBy, expense.amountCents)
  }

  for (const s of settlements) {
    assertCents(s.amountCents, 'pago')
    add(s.fromUser, s.amountCents)
    add(s.toUser, -s.amountCents)
  }

  return balances
}
