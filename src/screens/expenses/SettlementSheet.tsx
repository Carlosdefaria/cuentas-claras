// Hoja inferior «Registrar pago» (variante A): quién paga a quién (fijo: sale de la lista de pagos sugeridos), el
// importe (relleno con lo sugerido; se puede cambiar para pagos parciales) y la fecha. Solo quien paga o quien cobra
// (lo comprueba validateSettlement y otra vez la RPC create_settlement). Mismo <dialog> que «Invitar».

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { es } from '../../i18n/es'
import { db } from '../../lib/data'
import { createSettlement } from '../../lib/expenses'
import { dataErrorMessage } from '../../lib/dataErrors'
import { localToday } from '../../lib/dates'
import type { Person } from '../../lib/people'
import { centsToInputText, formatCents, parseEurosToCents } from '../../domain/money'
import { validateSettlement, type SettlementErrors } from '../../domain/settlementForm'
import { Alert, Button, Participacion } from '../../components/ui'
import { PersonDot } from './PersonDot'

const T = es.expenses.settlement

export interface SuggestedPayment {
  from: Person
  to: Person
  amountCents: number
}

function errorText(errors: SettlementErrors) {
  const E = T.errors
  return {
    amount: { required: E.amountRequired, invalid: E.amountInvalid, zero: E.amountZero, tooLarge: E.amountTooLarge }[errors.amount as string],
    date: errors.date ? E.date : undefined,
    people: errors.people ? E.people : undefined,
  }
}

export function SettlementSheet({
  payment,
  groupId,
  memberIds,
  me,
  onClose,
  onDone,
}: {
  /** El pago sugerido que se registra; null = hoja cerrada. */
  payment: SuggestedPayment | null
  groupId: string
  memberIds: readonly string[]
  me: string
  onClose: () => void
  onDone: (amountCents: number) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [amountText, setAmountText] = useState('')
  const [date, setDate] = useState(localToday)
  const [errors, setErrors] = useState<SettlementErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (payment && !dialog.open) {
      setAmountText(centsToInputText(payment.amountCents))
      setDate(localToday())
      setErrors({})
      setServerError(null)
      setSubmitting(false)
      dialog.showModal()
      amountRef.current?.focus({ focusVisible: false } as FocusOptions)
    } else if (!payment && dialog.open) dialog.close()
  }, [payment])

  const close = () => {
    if (!submitting) onClose()
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!payment || submitting) return
    setServerError(null)
    const result = validateSettlement({ amountText, date, fromUser: payment.from.id, toUser: payment.to.id, memberIds, me })
    if (!result.ok) {
      setErrors(result.errors)
      if (result.errors.amount) amountRef.current?.focus()
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await createSettlement(db, groupId, result.value)
      onDone(result.value.amountCents)
    } catch (e) {
      setServerError(dataErrorMessage(e))
      setSubmitting(false)
    }
  }

  const text = errorText(errors)
  const cents = parseEurosToCents(amountText)
  const over = payment && cents !== null && cents > payment.amountCents
  const nameOf = (p: Person) => (p.isMe ? es.expenses.balances.yourself : p.name)
  const other = payment ? (payment.from.isMe ? payment.to : payment.from) : null

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      className="hoja-inferior m-0 mt-auto w-full max-w-none bg-transparent p-0 text-tinta"
    >
      {payment && (
        <form noValidate onSubmit={onSubmit} className="mx-auto max-w-md rounded-t-2xl bg-hoja px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 [--troquel-fondo:var(--color-hoja)]">
          <div className="relative flex h-11 items-center justify-center">
            <span aria-hidden className="h-1.25 w-10 rounded-full bg-trazo" />
            <button
              type="button"
              onClick={close}
              aria-label={T.close}
              disabled={submitting}
              className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-lg text-tinta-suave hover:bg-papel hover:text-tinta disabled:opacity-60"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <Participacion title={<span id={titleId}>{T.title}</span>} tint="cielo" level={2} compact>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
              <span className="inline-flex items-center gap-2">
                <PersonDot person={payment.from} size="sm" />
                {nameOf(payment.from)}
              </span>
              <ArrowRight aria-hidden className="size-5 text-tinta-tenue" strokeWidth={2.25} />
              <span className="sr-only">{T.pays}</span>
              <span className="inline-flex items-center gap-2">
                <PersonDot person={payment.to} size="sm" />
                {nameOf(payment.to)}
              </span>
            </p>
            <label htmlFor="pago-importe" className="mt-3 block text-[0.9375rem] font-semibold text-tinta-suave">
              {T.amount}
            </label>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="-ml-1 inline-grid min-w-0 max-w-[calc(100%-2.5rem)]">
                <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre px-1 py-1 text-[2.75rem] font-bold leading-none tracking-[-0.01em] tabular-nums">
                  {amountText || es.expenses.form.amountPlaceholder}
                </span>
                <input
                  ref={amountRef}
                  id="pago-importe"
                  name="amount"
                  size={1}
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder={es.expenses.form.amountPlaceholder}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  aria-invalid={text.amount ? true : undefined}
                  aria-describedby={text.amount ? 'pago-importe-error' : over ? 'pago-importe-aviso' : undefined}
                  className={`col-start-1 row-start-1 w-full min-w-0 rounded-lg bg-transparent px-1 py-1 text-[2.75rem] font-bold leading-none tracking-[-0.01em] text-tinta tabular-nums placeholder:text-tinta-tenue focus:outline-none focus-visible:outline-none ${
                    text.amount ? 'shadow-[0_0_0_2px_var(--color-sello)] focus:shadow-[0_0_0_3px_var(--color-sello)]' : 'focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]'
                  }`}
                />
              </span>
              <span aria-hidden className="text-[1.875rem] font-semibold">
                €
              </span>
            </div>
            {text.amount ? (
              <p id="pago-importe-error" className="text-sm font-medium text-sello">
                {text.amount}
              </p>
            ) : (
              over && (
                <p id="pago-importe-aviso" className="text-sm text-tinta-suave">
                  {T.over(formatCents(payment.amountCents))}
                </p>
              )
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <label htmlFor="pago-fecha" className="text-[0.9375rem] font-semibold">
                {T.date}
              </label>
              <input
                id="pago-fecha"
                name="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={text.date ? true : undefined}
                aria-describedby={text.date ? 'pago-fecha-error' : undefined}
                className="h-12 w-[9.5rem] appearance-none rounded-lg border border-trazo bg-white px-3 text-tinta focus:border-loteria focus:outline-none focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]"
              />
            </div>
            {text.date && (
              <p id="pago-fecha-error" className="mt-1.5 text-right text-sm font-medium text-sello">
                {text.date}
              </p>
            )}
          </Participacion>
          <p className="mt-2.5 text-[0.8125rem] text-tinta-suave">{T.hint(other?.name ?? es.expenses.someone)}</p>
          <div className="mt-3 flex flex-col gap-2.5">
            {(serverError || text.people) && <Alert>{serverError ?? text.people}</Alert>}
            <Button type="submit" loading={submitting}>
              {submitting ? T.submitting : T.submit}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )
}
