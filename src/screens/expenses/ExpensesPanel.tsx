// Pestaña Gastos: «Añadir gasto» (la acción reina) y los gastos por día, con su total, quién pagó y cuánto te toca.

import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { es } from '../../i18n/es'
import { formatCents } from '../../domain/money'
import { dayLabel, groupByDay, localToday } from '../../lib/dates'
import type { ExpenseRow } from '../../lib/expenses'
import type { Person } from '../../lib/people'
import { ButtonLink } from '../../components/ui'
import { PersonDot } from './PersonDot'

const T = es.expenses

export function ExpensesPanel({ groupId, expenses, people, me }: { groupId: string; expenses: ExpenseRow[]; people: Map<string, Person>; me: string | null }) {
  const today = localToday()
  return (
    <>
      <ButtonLink to={`/grupos/${groupId}/gastos/nuevo`} state={{ fromGroup: true }}>
        <Plus aria-hidden className="size-5" strokeWidth={2.25} />
        {T.add}
      </ButtonLink>
      {expenses.length === 0 ? (
        <section className="mt-4 rounded-xl border-2 border-dashed border-trazo px-5 py-7 text-center">
          <h2 className="text-lg font-semibold">{T.emptyTitle}</h2>
          <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{T.emptyBody}</p>
        </section>
      ) : (
        groupByDay(expenses, (e) => e.date).map((day) => (
          // content-visibility: los días fuera de pantalla no se pintan (grupos con cientos de gastos).
          <section key={day.date} aria-label={dayLabel(day.date, today)} className="[contain-intrinsic-size:auto_240px] [content-visibility:auto]">
            <h2 className="mx-0.5 mb-2 mt-5 flex justify-between text-sm font-semibold text-tinta-suave">
              <span>{dayLabel(day.date, today)}</span>
              <span className="tabular-nums">{formatCents(day.items.reduce((a, e) => a + e.amountCents, 0))}</span>
            </h2>
            <ul className="divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
              {day.items.map((e) => {
                const payer = people.get(e.paidBy)
                const mine = me ? e.shares.find((s) => s.userId === me) : undefined
                return (
                  <li key={e.id}>
                    <Link
                      to={`/grupos/${groupId}/gastos/${e.id}`}
                      className="flex min-h-15 items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-white active:bg-papel"
                    >
                      <PersonDot person={payer} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold leading-snug">{e.description}</span>
                        <span className="block text-sm text-tinta-suave">
                          {payer?.isMe ? T.paidByYou : T.paidBy(payer?.name ?? T.someone)}
                        </span>
                      </span>
                      <span className="flex-none text-right tabular-nums">
                        <span className="block font-bold">{formatCents(e.amountCents)}</span>
                        <span className="block text-[0.8125rem] text-tinta-suave">{mine ? T.youOwe(formatCents(mine.amountCents)) : T.notIn}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
