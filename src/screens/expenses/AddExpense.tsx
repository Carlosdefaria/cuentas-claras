// Añadir y editar gasto (variante «Boleto»): el gasto es una participación. En el talón, el importe grande y el concepto;
// bajo el troquel, quién pagó, la fecha y una fila por participante con su cuota en vivo (reparto igual, resto
// determinista). Validación con validateExpense (dominio); se guarda con la RPC create_expense o update_expense (atómicas).
// Editar: solo quien añadió el gasto (lo comprueba también la RPC), con bloqueo optimista por updated_at.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { Check, ChevronDown } from 'lucide-react'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { activeMembers, getGroup, goneNames, listMembers, type Member } from '../../lib/groups'
import { createExpense, getExpense, updateExpense, type ExpenseRow } from '../../lib/expenses'
import { dataErrorMessage, isDataError } from '../../lib/dataErrors'
import { localToday } from '../../lib/dates'
import { peopleOf } from '../../lib/people'
import { useAsync } from '../../lib/useAsync'
import { basisPointsToText, centsToInputText, formatCents, parseEurosToCents, parsePercentToBasisPoints } from '../../domain/money'
import { splitByPercent, splitEqual } from '../../domain/split'
import {
  DESCRIPTION_MAX,
  MAX_EXPENSE_CENTS,
  draftFromExpense,
  isUnchanged,
  remainderRecipients,
  sharesFor,
  splitSummary,
  validateExpense,
  type ExpenseErrors,
  type SplitType,
} from '../../domain/expenseForm'
import { Alert, Button, ButtonLink, LoadError } from '../../components/ui'
import { TALON_BG } from '../../components/talonBg'
import { PersonDot } from './PersonDot'
import { SplitTypeSheet } from './SplitTypeSheet'

const T = es.expenses
const F = T.form
const S = T.split
const HOW = es.activity.splitNames

export function AddExpense() {
  const { id = '' } = useParams()
  const data = useAsync(async () => {
    const [group, members] = await Promise.all([getGroup(db, id), listMembers(db, id)])
    return { group, members }
  }, [id])

  if (data.status === 'loading') return <FormSkeleton />
  if (data.status === 'error') return <LoadError title={es.groups.detail.loadError} message={dataErrorMessage(data.error)} onRetry={data.reload} />
  if (!data.data.group) {
    return <Missing title={es.groups.detail.notFoundTitle} body={es.groups.detail.notFoundBody} to="/" action={es.groups.detail.toGroups} />
  }
  return <ExpenseForm groupId={data.data.group.id} members={data.data.members} />
}

export function EditExpense() {
  const { id = '', expenseId = '' } = useParams()
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.user.id : null
  const data = useAsync(async () => {
    const [expense, members] = await Promise.all([getExpense(db, id, expenseId), listMembers(db, id)])
    return { expense, members }
  }, [id, expenseId])

  if (data.status === 'loading') return <FormSkeleton />
  if (data.status === 'error') return <LoadError title={T.detail.loadError} message={dataErrorMessage(data.error)} onRetry={data.reload} />
  const { expense, members } = data.data
  if (!expense) return <Missing title={T.detail.notFoundTitle} body={T.detail.notFoundBody} to={`/grupos/${id}`} action={T.detail.toGroup} />
  if (expense.createdBy !== me) {
    const author = members.find((m) => m.userId === expense.createdBy)?.name ?? T.someone
    return <Missing title={T.edit.notAllowedTitle} body={T.edit.notAllowedBody(author)} to={`/grupos/${id}/gastos/${expense.id}`} action={T.edit.toExpense} />
  }
  const gone = goneNames([expense.paidBy, ...expense.shares.map((s) => s.userId)], members)
  if (gone.length > 0) {
    return <Missing title={T.edit.readOnlyTitle} body={T.readOnly.expense(gone)} to={`/grupos/${id}/gastos/${expense.id}`} action={T.edit.toExpense} />
  }
  return <ExpenseForm groupId={id} members={members} editing={expense} />
}

function Missing({ title, body, to, action }: { title: string; body: string; to: string; action: string }) {
  return (
    <section className="mt-2 rounded-xl border-2 border-dashed border-trazo px-5 py-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{body}</p>
      <div className="mx-auto mt-6 max-w-xs">
        <ButtonLink to={to}>{action}</ButtonLink>
      </div>
    </section>
  )
}

const list = new Intl.ListFormat('es', { type: 'conjunction' })

/** Tamaño de la cifra en la caja del importe: grande siempre, y más pequeña con importes largos para que quepa. */
const amountSize = (text: string) => (text.length <= 7 ? 'text-[3.5rem]' : text.length <= 9 ? 'text-[2.75rem]' : 'text-[2.25rem]')

function errorText(errors: ExpenseErrors) {
  const E = F.errors
  return {
    amount: { required: E.amountRequired, invalid: E.amountInvalid, zero: E.amountZero, tooLarge: E.amountTooLarge }[errors.amount as string],
    description: { required: E.descriptionRequired, tooLong: E.descriptionTooLong }[errors.description as string],
    paidBy: errors.paidBy ? E.paidBy : undefined,
    participants: errors.participants ? E.participants : undefined,
    date: errors.date ? E.date : undefined,
    split: errors.shares ? S.errors.shares : errors.split ? S.errors[errors.split] : undefined,
  }
}

function ExpenseForm({ groupId, members: allMembers, editing }: { groupId: string; members: Member[]; editing?: ExpenseRow }) {
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.user.id : null
  const navigate = useNavigate()
  const location = useLocation()
  // Talones con todos (nadie cambia de color); el formulario solo ofrece a quien sigue en el grupo (RF-11).
  const people = useMemo(() => peopleOf(allMembers, me), [allMembers, me])
  const members = useMemo(() => activeMembers(allMembers), [allMembers])
  const ordered = useMemo(() => [...members].sort((a, b) => Number(b.userId === me) - Number(a.userId === me)), [members, me])

  // Al editar, el formulario empieza con el gasto guardado; al añadir, vacío, pagas tú y entre todos, hoy.
  const [initial] = useState(() =>
    editing
      ? draftFromExpense(editing, members.map((m) => m.userId))
      : {
          amountText: '',
          description: '',
          paidBy: me && people.has(me) ? me : (members[0]?.userId ?? ''),
          participants: members.map((m) => m.userId),
          date: localToday(),
          splitType: 'equal' as SplitType,
          amounts: {} as Readonly<Record<string, string>>,
          percents: {} as Readonly<Record<string, string>>,
        },
  )
  const [amountText, setAmountText] = useState(initial.amountText)
  const [description, setDescription] = useState(initial.description)
  const [paidBy, setPaidBy] = useState<string>(initial.paidBy ?? '')
  const [participants, setParticipants] = useState<Set<string>>(() => new Set(initial.participants))
  const [date, setDate] = useState(initial.date)
  // Cómo se reparte (variante B): la frase «Se reparte a partes iguales ▾» abre la hoja; por importes o porcentajes,
  // cada persona tiene su campo.
  const [splitType, setSplitType] = useState<SplitType>(initial.splitType ?? 'equal')
  const [amounts, setAmounts] = useState<Record<string, string>>(() => ({ ...initial.amounts }))
  const [percents, setPercents] = useState<Record<string, string>>(() => ({ ...initial.percents }))
  const [splitSheet, setSplitSheet] = useState(false)
  const splitButton = useRef<HTMLButtonElement>(null)
  const [conflict, setConflict] = useState(false)
  const [errors, setErrors] = useState<ExpenseErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const paidByRef = useRef<HTMLSelectElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const participantsRef = useRef<HTMLFieldSetElement>(null)
  const text = errorText(errors)

  // Salir con el gasto a medio escribir o con cambios sin guardar (p. ej. «Volver» sin querer) pide confirmación;
  // tras guardar, no.
  const saved = useRef(false)
  const dirty = editing
    ? amountText !== initial.amountText ||
      description !== initial.description ||
      paidBy !== initial.paidBy ||
      date !== initial.date ||
      participants.size !== initial.participants.length ||
      initial.participants.some((p) => !participants.has(p)) ||
      splitType !== (initial.splitType ?? 'equal') ||
      (splitType === 'amounts' && !sameTexts(amounts, initial.amounts)) ||
      (splitType === 'percent' && !sameTexts(percents, initial.percents))
    : amountText.trim() !== '' || description.trim() !== ''
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
    if (window.confirm(editing ? T.edit.discard : F.discard)) blocker.proceed()
    else blocker.reset()
  }, [blocker, editing])

  // Vista previa en vivo: solo con un importe válido y alguien marcado.
  const preview = useMemo(() => {
    const cents = parseEurosToCents(amountText)
    if (!cents || cents > MAX_EXPENSE_CENTS || participants.size === 0) return null
    const ids = [...participants]
    return { shares: new Map(sharesFor(cents, ids).map((s) => [s.userId, s.amountCents])), extra: remainderRecipients(cents, ids) }
  }, [amountText, participants])

  /**
   * Cambiar de reparto conserva el importe y quién participa. Por importes o porcentajes, si las filas están vacías se
   * rellenan con el reparto igual entre quienes participan: solo hay que tocar lo que cambia. De vuelta a partes
   * iguales, participan quienes tenían algo.
   */
  function chooseSplit(next: SplitType) {
    setSplitSheet(false)
    if (next === splitType) return
    const ids = ordered.map((m) => m.userId)
    const inPlay = ids.filter((id) => participants.has(id))
    const blank = (texts: Record<string, string>) => Object.values(texts).every((t) => t.trim() === '')
    if (next === 'amounts' && blank(amounts)) {
      const cents = parseEurosToCents(amountText)
      const fill = cents && inPlay.length > 0 ? new Map(sharesFor(cents, inPlay).map((x) => [x.userId, centsToInputText(x.amountCents)])) : new Map<string, string>()
      setAmounts(Object.fromEntries(ids.map((id) => [id, fill.get(id) ?? ''])))
    }
    if (next === 'percent' && blank(percents)) {
      const fill = inPlay.length > 0 ? splitEqual(10000, inPlay) : new Map<string, number>()
      setPercents(Object.fromEntries(ids.map((id) => [id, fill.has(id) ? basisPointsToText(fill.get(id)!) : ''])))
    }
    if (next === 'equal') {
      const texts = splitType === 'amounts' ? amounts : percents
      const parse = splitType === 'amounts' ? parseEurosToCents : parsePercentToBasisPoints
      const withValue = ids.filter((id) => (parse(texts[id] ?? '') ?? 0) > 0)
      if (withValue.length > 0) setParticipants(new Set(withValue))
    }
    setErrors((prev) => ({ ...prev, split: undefined, shares: undefined, participants: undefined }))
    setSplitType(next)
  }

  const memberIds = useMemo(() => members.map((m) => m.userId), [members])
  const draft = { amountText, description, paidBy, participants: [...participants], date, memberIds, splitType, amounts, percents }
  const summary = splitSummary(draft)
  // Por porcentajes: lo que le toca a cada uno, cuando ya suman 100 % y hay un importe válido.
  const percentPreview = useMemo(() => {
    if (splitType !== 'percent') return null
    const cents = parseEurosToCents(amountText)
    const bp = new Map(Object.entries(percents).flatMap(([id, t]) => {
      const v = parsePercentToBasisPoints(t)
      return v && v > 0 ? [[id, v] as const] : []
    }))
    const total = [...bp.values()].reduce((a, v) => a + v, 0)
    if (!cents || cents > MAX_EXPENSE_CENTS || total !== 10000) return null
    return splitByPercent(cents, bp)
  }, [splitType, amountText, percents])

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
    setConflict(false)
    const result = validateExpense(draft)
    if (!result.ok) {
      setErrors(result.errors)
      const first = (['amount', 'description', 'paidBy', 'date', 'participants', 'split', 'shares'] as const).find((k) => result.errors[k])
      const badRow = result.errors.shares ? Object.keys(result.errors.shares)[0] : null
      const target = {
        amount: amountRef.current,
        description: descriptionRef.current,
        paidBy: paidByRef.current,
        date: dateRef.current,
        participants: participantsRef.current?.querySelector('input'),
        split: participantsRef.current?.querySelector('input'),
        shares: badRow ? participantsRef.current?.querySelector<HTMLInputElement>(`input[data-user="${badRow}"]`) : null,
      }
      if (first) target[first]?.focus()
      return
    }
    setErrors({})
    if (editing && isUnchanged(editing, result.value)) {
      leave() // nada que guardar
      return
    }
    setSubmitting(true)
    try {
      if (editing) await updateExpense(db, editing.id, editing.updatedAt, result.value)
      else await createExpense(db, groupId, result.value)
      leave()
    } catch (e) {
      setServerError(dataErrorMessage(e))
      setConflict(isDataError(e, 'conflict'))
      setSubmitting(false)
    }
  }

  // Se vuelve atrás si se llegó desde el grupo o desde el gasto (la pantalla recarga desde la red); si se entró directo,
  // se va al grupo (añadir) o al gasto (editar).
  function leave() {
    saved.current = true
    const from = location.state as { fromGroup?: boolean; fromExpense?: boolean } | null
    if (editing ? from?.fromExpense : from?.fromGroup) navigate(-1)
    else navigate(editing ? `/grupos/${groupId}/gastos/${editing.id}` : `/grupos/${groupId}`, { replace: true })
  }

  function reloadAfterConflict() {
    saved.current = true
    navigate(`/grupos/${groupId}/gastos/${editing!.id}`, { replace: true })
  }

  const nameOf = (userId: string) => people.get(userId)?.name ?? T.someone
  const labelOf = (userId: string, name: string) => (userId === me ? T.youName(name) : name)
  const describedBy = (field: string, show: unknown) => (show ? `gasto-${field}-error` : undefined)

  return (
    <form noValidate onSubmit={onSubmit}>
      <h1 className="sr-only">{editing ? T.edit.title : T.add}</h1>
      <section className="rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]">
        <div className={`${TALON_BG.mantequilla} rounded-t-xl px-5 pb-3 pt-4`}>
          <label htmlFor="gasto-importe" className="text-[0.9375rem] font-semibold text-tinta-suave">
            {F.amount}
          </label>
          {/* «Caja del importe» (variante C): un campo blanco grande con el «€» dentro, inconfundible; al escribir, borde
              verde y halo. La cifra se encoge con importes largos para caber siempre (hasta 1.000.000,00 €). */}
          {/* La caja entera es zona táctil del campo (también el «€»). */}
          <label
            className={`mt-1.5 flex h-24 cursor-text items-center gap-2 rounded-xl border-2 bg-white px-4 transition-[border-color,box-shadow] duration-150 ${
              text.amount
                ? 'border-sello focus-within:shadow-[0_0_0_4px_rgb(179_48_42/0.18)]'
                : 'border-tinta/30 focus-within:border-loteria focus-within:shadow-[0_0_0_4px_rgb(13_86_55/0.18)]'
            }`}
          >
            <input
              ref={amountRef}
              id="gasto-importe"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              placeholder={F.amountPlaceholder}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={text.amount ? true : undefined}
              aria-describedby={describedBy('importe', text.amount)}
              className={`h-full w-full min-w-0 flex-1 bg-transparent font-bold leading-none tracking-[-0.02em] text-tinta tabular-nums placeholder:text-tinta-tenue/80 focus:outline-none focus-visible:outline-none ${amountSize(amountText)}`}
            />
            <span aria-hidden className="flex-none text-[2rem] font-semibold text-tinta-suave">
              €
            </span>
          </label>
          {text.amount && (
            <p id="gasto-importe-error" className="mt-1.5 text-sm font-medium text-sello">
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
            className={`mt-3 h-12 w-full rounded-lg border bg-white/75 px-3.5 text-tinta placeholder:text-tinta-tenue transition-[border-color,box-shadow] duration-150 focus:bg-white focus:outline-none ${
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

          <fieldset ref={participantsRef} className="mt-4" aria-describedby={describedBy('participantes', text.participants ?? text.split)}>
            <div className="flex items-center justify-between gap-2">
              <legend className="text-[0.9375rem]">
                {S.phrase}{' '}
                <button
                  ref={splitButton}
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={S.change(HOW[splitType])}
                  onClick={() => setSplitSheet(true)}
                  className="-my-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg font-semibold text-loteria underline decoration-2 underline-offset-[3px] hover:text-loteria-hondo"
                >
                  {HOW[splitType]}
                  <ChevronDown aria-hidden className="size-4" strokeWidth={2.25} />
                </button>
              </legend>
              {splitType === 'equal' && (
                <button
                  type="button"
                  onClick={() => setParticipants(participants.size === members.length ? new Set() : new Set(members.map((m) => m.userId)))}
                  className="-mr-2 inline-flex min-h-11 flex-none items-center rounded-lg px-2 text-[0.9375rem] font-semibold text-loteria underline hover:text-loteria-hondo"
                >
                  {participants.size === members.length ? F.none : F.all}
                </button>
              )}
            </div>
            <ul className="divide-y divide-dashed divide-trazo">
              {ordered.map((m) => {
                const person = people.get(m.userId)
                if (splitType === 'equal') {
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
                        <PersonDot person={person} size="sm" />
                        <span className="min-w-0 flex-1 break-words font-semibold">{labelOf(m.userId, m.name)}</span>
                        <span className={`flex-none font-semibold tabular-nums ${on ? '' : 'text-tinta-tenue'}`}>
                          {on && cents !== undefined ? formatCents(cents) : '—'}
                        </span>
                      </label>
                    </li>
                  )
                }
                // Por importes o por porcentajes: un campo por persona (vacío o 0 = no participa).
                const isAmounts = splitType === 'amounts'
                const value = (isAmounts ? amounts : percents)[m.userId] ?? ''
                const bad = errors.shares?.[m.userId] !== undefined
                const cents = percentPreview?.get(m.userId)
                const id = `gasto-cuota-${m.userId}`
                return (
                  <li key={m.userId} className="flex min-h-14 items-center gap-3 py-1.5">
                    <PersonDot person={person} size="sm" />
                    <label htmlFor={id} className="min-w-0 flex-1">
                      <span className="block break-words font-semibold leading-snug">{labelOf(m.userId, m.name)}</span>
                      {!isAmounts && cents !== undefined && <span className="block text-[0.8125rem] text-tinta-suave tabular-nums">{formatCents(cents)}</span>}
                      <span className="sr-only">{isAmounts ? S.amountOf(m.name) : S.percentOf(m.name)}</span>
                    </label>
                    <span
                      className={`flex h-11 flex-none items-center gap-1 rounded-lg border bg-white px-2.5 focus-within:border-loteria focus-within:shadow-[0_0_0_3px_rgb(13_86_55/0.18)] ${
                        isAmounts ? 'w-[7.25rem]' : 'w-[5.75rem]'
                      } ${bad ? 'border-sello' : 'border-trazo'}`}
                    >
                      <input
                        id={id}
                        data-user={m.userId}
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="next"
                        placeholder={isAmounts ? F.amountPlaceholder : '0'}
                        value={value}
                        onChange={(e) => (isAmounts ? setAmounts : setPercents)((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                        onFocus={(e) => e.currentTarget.select()}
                        aria-invalid={bad ? true : undefined}
                        className="w-full min-w-0 bg-transparent text-right text-base font-semibold text-tinta tabular-nums placeholder:font-normal placeholder:text-tinta-tenue focus:outline-none"
                      />
                      <span aria-hidden className="text-tinta-tenue">
                        {isAmounts ? '€' : '%'}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            {summary && <SplitSummaryLine summary={summary} error={Boolean(errors.split)} />}
            {(text.participants || text.split) && (
              <p id="gasto-participantes-error" className="mt-1.5 text-sm font-medium text-sello">
                {text.participants ?? text.split}
              </p>
            )}
            {splitType === 'equal' && preview && preview.extra.length > 0 && (
              <p className="mt-1 text-[0.8125rem] text-tinta-suave">{F.remainder(preview.extra.length, list.format(preview.extra.map(nameOf)))}</p>
            )}
          </fieldset>
          <SplitTypeSheet
            open={splitSheet}
            value={splitType}
            onChoose={chooseSplit}
            onClose={() => {
              setSplitSheet(false)
              splitButton.current?.focus()
            }}
          />
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-3">
        {serverError && <Alert>{serverError}</Alert>}
        {conflict ? (
          <Button type="button" onClick={reloadAfterConflict}>
            {T.edit.reload}
          </Button>
        ) : (
          <Button type="submit" loading={submitting}>
            {editing ? (submitting ? T.edit.saving : T.edit.save) : submitting ? T.adding : T.add}
          </Button>
        )}
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

const sameTexts = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>> | undefined) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b ?? {})])
  return [...keys].every((k) => (a[k] ?? '').trim() === (b?.[k] ?? '').trim())
}

/** «Llevas 116,80 € de 120,00 € · Faltan 3,20 €» / «Llevas 95 % · Faltan 5 %» / «✓ Cuadra». */
function SplitSummaryLine({ summary, error }: { summary: NonNullable<ReturnType<typeof splitSummary>>; error: boolean }) {
  let left: string
  let right: string
  let ok: boolean
  if (summary.kind === 'amounts') {
    left = summary.totalCents === null ? '' : S.assignedAmounts(formatCents(summary.assignedCents), formatCents(summary.totalCents))
    const diff = summary.diffCents ?? 0
    ok = summary.totalCents !== null && diff === 0
    right = summary.totalCents === null ? '' : diff > 0 ? S.missing(formatCents(diff)) : diff < 0 ? S.over(formatCents(-diff)) : S.ok
  } else {
    left = S.assignedPercent(basisPointsToText(summary.assignedBp))
    ok = summary.diffBp === 0
    right = summary.diffBp > 0 ? S.missing(`${basisPointsToText(summary.diffBp)} %`) : summary.diffBp < 0 ? S.over(`${basisPointsToText(-summary.diffBp)} %`) : S.ok
  }
  if (!left) return null
  const tone = ok ? 'bg-loteria-claro text-loteria-hondo' : error ? 'bg-sello-claro text-sello' : 'bg-papel text-tinta-suave'
  return (
    <p aria-live="polite" className={`mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-2.5 text-sm font-semibold tabular-nums ${tone}`}>
      <span>{left}</span>
      <span className="inline-flex items-center gap-1">
        {ok && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
        {right}
      </span>
    </p>
  )
}
