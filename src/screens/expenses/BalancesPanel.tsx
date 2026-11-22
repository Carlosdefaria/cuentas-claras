// Pestaña Saldos: «Tu saldo» en una participación (cifra grande y desglose) y el resto del grupo debajo.
// Saldos siempre de computeBalances; positivo = le deben. Rojo sello solo para «debe».

import { es } from '../../i18n/es'
import { formatCents } from '../../domain/money'
import { balanceKind } from '../../domain/balanceText'
import type { Settlement } from '../../domain/balances'
import type { ExpenseRow } from '../../lib/expenses'
import type { Person } from '../../lib/people'
import { Participacion } from '../../components/ui'
import { PersonDot } from './PersonDot'

const T = es.expenses.balances
const TONE = { owed: 'text-favor', owes: 'text-sello', settled: 'text-tinta-suave' } as const

export function BalancesPanel({
  balances,
  people,
  me,
  expenses,
  settlements,
}: {
  balances: Map<string, number>
  people: Map<string, Person>
  me: string | null
  expenses: ExpenseRow[]
  settlements: Settlement[]
}) {
  const mine = me ? (balances.get(me) ?? 0) : 0
  const kind = balanceKind(mine)
  const paid = expenses.filter((e) => e.paidBy === me).reduce((a, e) => a + e.amountCents, 0)
  const share = expenses.reduce((a, e) => a + (e.shares.find((s) => s.userId === me)?.amountCents ?? 0), 0)
  const hasSettlements = settlements.some((s) => s.fromUser === me || s.toUser === me)
  const others = [...balances.entries()].filter(([id]) => id !== me).sort((a, b) => b[1] - a[1])

  return (
    <>
      <Participacion title={T.yours} tint="menta" level={2} compact className="shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]">
        <p className={`text-[1.875rem] font-bold leading-tight tabular-nums ${TONE[kind]}`}>
          {kind === 'owed' ? T.youAreOwed(formatCents(mine)) : kind === 'owes' ? T.youOwe(formatCents(-mine)) : T.youSettled}
        </p>
        <p className="mt-1 text-tinta-suave tabular-nums">
          {T.breakdown(formatCents(paid), formatCents(share))}
          {hasSettlements && ` ${T.withSettlements}`}
        </p>
      </Participacion>

      {others.length > 0 && (
        <>
          <h2 className="mx-0.5 mb-2 mt-5 text-sm font-semibold text-tinta-suave">{T.wholeGroup}</h2>
          <ul className="divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
            {others.map(([id, cents]) => {
              const k = balanceKind(cents)
              return (
                <li key={id} className="flex min-h-15 items-center gap-3 px-3.5 py-2.5">
                  <PersonDot person={people.get(id)} />
                  <span className="min-w-0 flex-1 break-words font-semibold">{people.get(id)?.name ?? es.expenses.someone}</span>
                  <span className={`flex-none font-bold tabular-nums ${TONE[k]}`}>
                    {k === 'owed' ? T.isOwed(formatCents(cents)) : k === 'owes' ? T.owes(formatCents(-cents)) : T.settled}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <p className="mt-4 text-center text-sm text-tinta-suave">{T.soon}</p>
    </>
  )
}
