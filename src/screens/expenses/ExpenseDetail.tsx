// Detalle de un gasto: importe, quién pagó y cuándo, y la cuota de cada participante («saldos que no se discuten»).

import { useParams } from 'react-router'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { listMembers } from '../../lib/groups'
import { getExpense } from '../../lib/expenses'
import { dataErrorMessage } from '../../lib/dataErrors'
import { peopleOf } from '../../lib/people'
import { useAsync } from '../../lib/useAsync'
import { formatCents } from '../../domain/money'
import { ButtonLink, LoadError } from '../../components/ui'
import { TALON_BG } from '../../components/talonBg'
import { PersonDot } from './PersonDot'

const T = es.expenses
const longDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return longDate.format(Date.UTC(y, m - 1, d))
}

export function ExpenseDetail() {
  const { id = '', expenseId = '' } = useParams()
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.user.id : null
  const data = useAsync(async () => {
    const [expense, members] = await Promise.all([getExpense(db, id, expenseId), listMembers(db, id)])
    return { expense, members }
  }, [id, expenseId])

  if (data.status === 'loading') {
    return (
      <div aria-busy="true">
        <p className="sr-only" role="status">
          {es.common.loading}
        </p>
        <div aria-hidden className="h-72 animate-pulse rounded-xl bg-hoja" />
      </div>
    )
  }
  if (data.status === 'error') return <LoadError title={T.detail.loadError} message={dataErrorMessage(data.error)} onRetry={data.reload} />
  const { expense, members } = data.data
  if (!expense) {
    return (
      <section className="mt-2 rounded-xl border-2 border-dashed border-trazo px-5 py-8 text-center">
        <h1 className="text-lg font-semibold">{T.detail.notFoundTitle}</h1>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{T.detail.notFoundBody}</p>
        <div className="mx-auto mt-6 max-w-xs">
          <ButtonLink to={`/grupos/${id}`}>{T.detail.toGroup}</ButtonLink>
        </div>
      </section>
    )
  }

  const people = peopleOf(members, me)
  const payer = people.get(expense.paidBy)
  // Mismo orden que en el formulario: tú primero y después por orden de llegada al grupo.
  const order = new Map(members.map((m, i) => [m.userId, m.userId === me ? -1 : i]))
  const shares = [...expense.shares].sort((a, b) => (order.get(a.userId) ?? 1e9) - (order.get(b.userId) ?? 1e9))

  // Como al añadirlo: en el talón, cuánto y de qué; bajo el troquel, quién pagó, cuándo y el reparto.
  return (
    <section className="rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]">
      <div className={`${TALON_BG.mantequilla} rounded-t-xl px-5 pb-3 pt-4`}>
        <p className="text-[2.75rem] font-bold leading-none tracking-[-0.01em] tabular-nums">{formatCents(expense.amountCents)}</p>
        <h1 className="mt-2 break-words text-lg font-semibold leading-snug">{expense.description}</h1>
      </div>
      <div className={`troquel ${TALON_BG.mantequilla}`} style={{ backgroundImage: 'linear-gradient(to bottom, transparent 50%, var(--color-hoja) 50%)' }} aria-hidden />
      <div className="px-5 pb-5 pt-1">
        <p className="text-tinta-suave">{T.detail.paidOn(payer?.isMe ? T.you : (payer?.name ?? T.someone), formatDay(expense.date))}</p>
        <h2 className="mt-4 text-[0.9375rem] font-semibold">{T.detail.split}</h2>
        <ul className="mt-1 divide-y divide-dashed divide-trazo">
          {shares.map((s) => {
            const person = people.get(s.userId)
            return (
              <li key={s.userId} className="flex min-h-13 items-center gap-3">
                <PersonDot person={person} size="sm" />
                <span className="min-w-0 flex-1 break-words font-semibold">
                  {person?.isMe ? T.youName(person.name) : (person?.name ?? T.someone)}
                </span>
                <span className="flex-none font-semibold tabular-nums">{formatCents(s.amountCents)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
