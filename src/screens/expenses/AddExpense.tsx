// Añadir gasto (variante «Boleto»): el gasto es una participación. En el talón, el importe grande y el concepto; bajo
// el troquel, quién pagó, la fecha y una fila por participante con su cuota en vivo (reparto igual, resto determinista).
// Validación con validateExpense (dominio); se guarda con la RPC create_expense (atómica).

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { getGroup, listMembers, type Member } from '../../lib/groups'
import { createExpense } from '../../lib/expenses'
import { dataErrorMessage } from '../../lib/dataErrors'
import { localToday } from '../../lib/dates'
import { peopleOf } from '../../lib/people'
import { useAsync } from '../../lib/useAsync'
import { formatCents, parseEurosToCents } from '../../domain/money'
import { DESCRIPTION_MAX, MAX_EXPENSE_CENTS, remainderRecipients, sharesFor, validateExpense, type ExpenseErrors } from '../../domain/expenseForm'
import { Alert, Button, ButtonLink, LoadError } from '../../components/ui'
import { TALON_BG } from '../../components/talonBg'
import { PersonDot } from './PersonDot'

const T = es.expenses
const F = T.form

export function AddExpense() {
  const { id = '' } = useParams()
  const data = useAsync(async () => {
    const [group, members] = await Promise.all([getGroup(db, id), listMembers(db, id)])
    return { group, members }
  }, [id])

  if (data.status === 'loading') return <FormSkeleton />
  if (data.status === 'error') return <LoadError title={es.groups.detail.loadError} message={dataErrorMessage(data.error)} onRetry={data.reload} />
  if (!data.data.group) {
    return (
      <section className="mt-2 rounded-xl border-2 border-dashed border-trazo px-5 py-8 text-center">
        <h1 className="text-lg font-semibold">{es.groups.detail.notFoundTitle}</h1>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{es.groups.detail.notFoundBody}</p>
        <div className="mx-auto mt-6 max-w-xs">
          <ButtonLink to="/">{es.groups.detail.toGroups}</ButtonLink>
        </div>
      </section>
    )
  }
  return <ExpenseForm groupId={data.data.group.id} members={data.data.members} />
}

const list = new Intl.ListFormat('es', { type: 'conjunction' })

function errorText(errors: ExpenseErrors) {
  const E = F.errors
  return {
    amount: { required: E.amountRequired, invalid: E.amountInvalid, zero: E.amountZero, tooLarge: E.amountTooLarge }[errors.amount as string],
    description: { required: E.descriptionRequired, tooLong: E.descriptionTooLong }[errors.description as string],
    paidBy: errors.paidBy ? E.paidBy : undefined,
    participants: errors.participants ? E.participants : undefined,
    date: errors.date ? E.date : undefined,
  }
}

function ExpenseForm({ groupId, members }: { groupId: string; members: Member[] }) {
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.user.id : null
  const navigate = useNavigate()
  const location = useLocation()
  const people = useMemo(() => peopleOf(members, me), [members, me])
  const ordered = useMemo(() => [...members].sort((a, b) => Number(b.userId === me) - Number(a.userId === me)), [members, me])

  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [paidBy, setPaidBy] = useState<string>(() => (me && people.has(me) ? me : (members[0]?.userId ?? '')))
  const [participants, setParticipants] = useState<Set<string>>(() => new Set(members.map((m) => m.userId)))
  const [date, setDate] = useState(() => localToday())
  const [errors, setErrors] = useState<ExpenseErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const paidByRef = useRef<HTMLSelectElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const participantsRef = useRef<HTMLFieldSetElement>(null)
  const text = errorText(errors)

  // Salir con el gasto a medio escribir (p. ej. «Volver» sin querer) pide confirmación; tras guardar, no.
  const saved = useRef(false)
  const dirty = amountText.trim() !== '' || description.trim() !== ''
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    // Recargar o salir del documento (fuera del router): el aviso del navegador.
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(F.discard)) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  // Vista previa en vivo: solo con un importe válido y alguien marcado.
  const preview = useMemo(() => {
    const cents = parseEurosToCents(amountText)
    if (!cents || cents > MAX_EXPENSE_CENTS || participants.size === 0) return null
    const ids = [...participants]
    return { shares: new Map(sharesFor(cents, ids).map((s) => [s.userId, s.amountCents])), extra: remainderRecipients(cents, ids) }
  }, [amountText, participants])

  function toggle(userId: string) {
    setParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setServerError(null)
    const result = validateExpense({ amountText, description, paidBy, participants: [...participants], date, memberIds: members.map((m) => m.userId) })
    if (!result.ok) {
      setErrors(result.errors)
      const first = (['amount', 'description', 'paidBy', 'date', 'participants'] as const).find((k) => result.errors[k])
      const target = {
        amount: amountRef.current,
        description: descriptionRef.current,
        paidBy: paidByRef.current,
        date: dateRef.current,
        participants: participantsRef.current?.querySelector('input'),
      }
      if (first) target[first]?.focus()
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await createExpense(db, groupId, result.value)
      saved.current = true
      // Desde el grupo se vuelve atrás (el detalle recarga desde la red); si se entró directo, se va al grupo.
      if ((location.state as { fromGroup?: boolean } | null)?.fromGroup) navigate(-1)
      else navigate(`/grupos/${groupId}`, { replace: true })
    } catch (e) {
      setServerError(dataErrorMessage(e))
      setSubmitting(false)
    }
  }

  const nameOf = (userId: string) => people.get(userId)?.name ?? T.someone
  const describedBy = (field: string, show: unknown) => (show ? `gasto-${field}-error` : undefined)

  return (
    <form noValidate onSubmit={onSubmit}>
      <h1 className="sr-only">{T.add}</h1>
      <section className="rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]">
        <div className={`${TALON_BG.mantequilla} rounded-t-xl px-5 pb-3 pt-4`}>
          <label htmlFor="gasto-importe" className="text-[0.9375rem] font-semibold text-tinta-suave">
            {F.amount}
          </label>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            {/* El campo mide lo que su texto: un gemelo invisible en la misma celda de la rejilla le da el ancho exacto
                (las comas son más estrechas que las cifras), y el «€» queda pegado detrás. */}
            <span className="-ml-1 inline-grid min-w-0 max-w-[calc(100%-2.5rem)]">
              <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre px-1 py-1 text-[2.75rem] font-bold leading-none tracking-[-0.01em] tabular-nums">
                {amountText || F.amountPlaceholder}
              </span>
            <input
              ref={amountRef}
              id="gasto-importe"
              name="amount"
              size={1}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              placeholder={F.amountPlaceholder}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={text.amount ? true : undefined}
              aria-describedby={describedBy('importe', text.amount)}
              className={`col-start-1 row-start-1 w-full min-w-0 rounded-lg bg-transparent px-1 py-1 text-[2.75rem] font-bold leading-none tracking-[-0.01em] text-tinta tabular-nums placeholder:text-tinta-tenue focus:outline-none focus-visible:outline-none ${
                text.amount ? 'shadow-[0_0_0_2px_var(--color-sello)] focus:shadow-[0_0_0_3px_var(--color-sello)]' : 'focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]'
              }`}
            />
            </span>
            <span aria-hidden className="text-[1.875rem] font-semibold">
              €
            </span>
          </div>
          {text.amount && (
            <p id="gasto-importe-error" className="text-sm font-medium text-sello">
              {text.amount}
            </p>
          )}
          <label htmlFor="gasto-concepto" className="sr-only">
            {F.description}
          </label>
          <input
            ref={descriptionRef}
            id="gasto-concepto"
            name="description"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={DESCRIPTION_MAX}
            placeholder={F.descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={text.description ? true : undefined}
            aria-describedby={describedBy('concepto', text.description)}
            className={`mt-2.5 h-12 w-full rounded-lg border bg-white/75 px-3.5 text-tinta placeholder:text-tinta-tenue transition-[border-color,box-shadow] duration-150 focus:bg-white focus:outline-none ${
              text.description
                ? 'border-sello focus:shadow-[0_0_0_3px_rgb(179_48_42/0.18)]'
                : 'border-trazo focus:border-loteria focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]'
            }`}
          />
          {text.description && (
            <p id="gasto-concepto-error" className="mt-1.5 text-sm font-medium text-sello">
              {text.description}
            </p>
          )}
        </div>
        <div className={`troquel ${TALON_BG.mantequilla}`} style={{ backgroundImage: 'linear-gradient(to bottom, transparent 50%, var(--color-hoja) 50%)' }} aria-hidden />

        <div className="px-5 pb-5 pt-1">
          <div className="flex gap-2.5">
            <div className="min-w-0 flex-1">
              <label htmlFor="gasto-pagador" className="mb-1.5 block text-[0.9375rem] font-semibold">
                {F.paidBy}
              </label>
              <div className="relative">
              <select
                ref={paidByRef}
                id="gasto-pagador"
                name="paidBy"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                aria-invalid={text.paidBy ? true : undefined}
                className="h-12 w-full appearance-none truncate rounded-lg border border-trazo bg-white pl-3 pr-9 text-tinta focus:border-loteria focus:outline-none focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]"
              >
                {ordered.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userId === me ? T.youName(m.name) : m.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-tinta-suave" />
              </div>
            </div>
            <div className="w-[9.5rem] flex-none">
              <label htmlFor="gasto-fecha" className="mb-1.5 block text-[0.9375rem] font-semibold">
                {F.date}
              </label>
              <input
                ref={dateRef}
                id="gasto-fecha"
                name="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={text.date ? true : undefined}
                aria-describedby={describedBy('fecha', text.date)}
                className="h-12 w-full appearance-none rounded-lg border border-trazo bg-white px-3 text-tinta focus:border-loteria focus:outline-none focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]"
              />
            </div>
          </div>
          {(text.paidBy || text.date) && (
            <p id="gasto-fecha-error" className="mt-1.5 text-sm font-medium text-sello">
              {text.paidBy ?? text.date}
            </p>
          )}

          <fieldset ref={participantsRef} className="mt-4" aria-describedby={describedBy('participantes', text.participants)}>
            <div className="flex items-center justify-between">
              <legend className="text-[0.9375rem] font-semibold">{F.splitEqual}</legend>
              <button
                type="button"
                onClick={() => setParticipants(participants.size === members.length ? new Set() : new Set(members.map((m) => m.userId)))}
                className="-mr-2 inline-flex min-h-11 items-center rounded-lg px-2 text-[0.9375rem] font-semibold text-loteria underline hover:text-loteria-hondo"
              >
                {participants.size === members.length ? F.none : F.all}
              </button>
            </div>
            <ul className="divide-y divide-dashed divide-trazo">
              {ordered.map((m) => {
                const on = participants.has(m.userId)
                const cents = preview?.shares.get(m.userId)
                return (
                  <li key={m.userId}>
                    <label className="flex min-h-13 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(m.userId)}
                        className="size-6 flex-none cursor-pointer accent-loteria"
                      />
                      <PersonDot person={people.get(m.userId)} size="sm" />
                      <span className="min-w-0 flex-1 break-words font-semibold">{m.userId === me ? T.youName(m.name) : m.name}</span>
                      <span className={`flex-none font-semibold tabular-nums ${on ? '' : 'text-tinta-tenue'}`}>
                        {on && cents !== undefined ? formatCents(cents) : '—'}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {text.participants && (
              <p id="gasto-participantes-error" className="mt-1 text-sm font-medium text-sello">
                {text.participants}
              </p>
            )}
            {preview && preview.extra.length > 0 && (
              <p className="mt-1 text-[0.8125rem] text-tinta-suave">{F.remainder(preview.extra.length, list.format(preview.extra.map(nameOf)))}</p>
            )}
          </fieldset>
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-3">
        {serverError && <Alert>{serverError}</Alert>}
        <Button type="submit" loading={submitting}>
          {submitting ? T.adding : T.add}
        </Button>
      </div>
    </form>
  )
}

function FormSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        {es.common.loading}
      </p>
      <div aria-hidden className="animate-pulse rounded-xl bg-hoja">
        <div className="h-36 rounded-t-xl bg-papel-hondo" />
        <div className="space-y-4 p-5">
          <div className="h-12 rounded-lg bg-papel" />
          <div className="h-12 rounded-lg bg-papel" />
          <div className="h-12 rounded-lg bg-papel" />
        </div>
      </div>
      <div aria-hidden className="mt-4 h-12 animate-pulse rounded-lg bg-loteria-claro" />
    </div>
  )
}
