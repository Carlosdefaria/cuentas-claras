// Detalle de un gasto: importe, quién pagó y cuándo, y la cuota de cada participante («saldos que no se discuten»).
// Variante A: quien lo añadió ve «Editar» y «Borrar» al pie del boleto; los demás, quién puede cambiarlo.

import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Pencil, Trash2 } from 'lucide-react'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { goneNames, listMembers } from '../../lib/groups'
import { ReadOnlyNote } from './ReadOnlyNote'
import { deleteExpense, getExpense, type ExpenseRow } from '../../lib/expenses'
import { dataErrorMessage, isDataError } from '../../lib/dataErrors'
import { localToday, whenLabel } from '../../lib/dates'
import { peopleOf } from '../../lib/people'
import { useAsync } from '../../lib/useAsync'
import { basisPointsToText, formatCents } from '../../domain/money'
import { ButtonLink, LoadError } from '../../components/ui'
import type { Person } from '../../lib/people'
import { ConfirmDeleteSheet } from './ConfirmDeleteSheet'
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
    <>
    <section className="rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]">
      <div className={`${TALON_BG.mantequilla} rounded-t-xl px-5 pb-3 pt-4`}>
        <p className="text-[2.75rem] font-bold leading-none tracking-[-0.01em] tabular-nums">{formatCents(expense.amountCents)}</p>
        <h1 className="mt-2 break-words text-lg font-semibold leading-snug">{expense.description}</h1>
      </div>
      <div className={`troquel ${TALON_BG.mantequilla}`} style={{ backgroundImage: 'linear-gradient(to bottom, transparent 50%, var(--color-hoja) 50%)' }} aria-hidden />
      <div className="px-5 pb-5 pt-1">
        <p className="text-tinta-suave">{T.detail.paidOn(payer?.isMe ? T.you : (payer?.name ?? T.someone), formatDay(expense.date))}</p>
        <h2 className="mt-4 text-[0.9375rem] font-semibold">
          {expense.splitType === 'equal' ? T.detail.split : T.detail.splitBy(es.activity.splitNames[expense.splitType])}
        </h2>
        <ul className="mt-1 divide-y divide-dashed divide-trazo">
          {shares.map((s) => {
            const person = people.get(s.userId)
            return (
              <li key={s.userId} className="flex min-h-13 items-center gap-3">
                <PersonDot person={person} size="sm" />
                <span className="min-w-0 flex-1 break-words font-semibold">
                  {person?.isMe ? T.youName(person.name) : (person?.name ?? T.someone)}
                </span>
                {s.percentBp !== undefined && (
                  <span className="flex-none text-[0.8125rem] text-tinta-suave tabular-nums">{basisPointsToText(s.percentBp)} %</span>
                )}
                <span className="flex-none font-semibold tabular-nums">{formatCents(s.amountCents)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
    <Authorship
      groupId={id}
      expense={expense}
      author={people.get(expense.createdBy)}
      gone={goneNames([expense.paidBy, ...expense.shares.map((s) => s.userId)], members)}
    />
    </>
  )
}

/** Quién lo añadió (y si se editó) y, solo para esa persona, «Editar» y «Borrar». */
function Authorship({ groupId, expense, author, gone }: { groupId: string; expense: ExpenseRow; author: Person | undefined; gone: string[] }) {
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)

  // created_at y updated_at coinciden al crearlo (misma transacción): distintos = se ha editado.
  const edited = new Date(expense.updatedAt).getTime() - new Date(expense.createdAt).getTime() > 1000
  // Solo quien lo añadió, y nunca si participa alguien que ya no está (RF-11: su saldo tiene que seguir en 0).
  const mine = author?.isMe === true && gone.length === 0
  const who = author?.isMe ? T.detail.addedByYou : T.detail.addedBy(author?.name ?? T.someone)
  const line = edited ? `${who} · ${T.detail.edited(whenLabel(expense.updatedAt, localToday()))}` : who

  async function confirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteExpense(db, expense.id)
      navigate(`/grupos/${groupId}`, { replace: true, state: { notice: T.remove.done(expense.description) } })
    } catch (e) {
      // Ya borrado (p. ej. desde otro móvil): lo mismo que si se acabara de borrar.
      if (isDataError(e, 'not-found')) {
        navigate(`/grupos/${groupId}`, { replace: true, state: { notice: T.remove.done(expense.description) } })
        return
      }
      setError(dataErrorMessage(e))
      setDeleting(false)
    }
  }

  return (
    <>
      <p className="mx-0.5 mt-3 text-[0.8125rem] text-tinta-suave">{line}</p>
      {mine ? (
        <div className="mt-3.5 flex gap-2.5">
          <ButtonLink to={`/grupos/${groupId}/gastos/${expense.id}/editar`} state={{ fromExpense: true }} tone="secundario" className="flex-1">
            <Pencil aria-hidden className="size-5" />
            {T.edit.action}
          </ButtonLink>
          <button
            ref={deleteButton}
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              setError(null)
              setSheetOpen(true)
            }}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-sello/40 bg-white px-4 text-base font-semibold text-sello transition-colors duration-150 hover:bg-sello-claro active:bg-sello-claro"
          >
            <Trash2 aria-hidden className="size-5" />
            {T.remove.action}
          </button>
        </div>
      ) : gone.length > 0 ? (
        <ReadOnlyNote>{T.readOnly.expense(gone)}</ReadOnlyNote>
      ) : (
        <p className="mx-0.5 mt-1 text-[0.8125rem] text-tinta-suave">{T.detail.onlyCreator(author?.name ?? T.someone)}</p>
      )}
      {mine && (
        <ConfirmDeleteSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false)
            deleteButton.current?.focus()
          }}
          onConfirm={() => void confirmDelete()}
          description={expense.description}
          amountCents={expense.amountCents}
          deleting={deleting}
          error={error}
        />
      )}
    </>
  )
}
