// Detalle de un pago (variante A): importe y «Pago a X» en un talón cielo; bajo el troquel, quién pagó a quién y cuándo.
// Quien lo registró puede borrarlo (hoja de confirmación); los demás leen quién puede.

import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight, Trash2 } from 'lucide-react'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { goneNames, listMembers } from '../../lib/groups'
import { ReadOnlyNote } from './ReadOnlyNote'
import { deleteSettlement, getSettlement } from '../../lib/expenses'
import { dataErrorMessage, isDataError } from '../../lib/dataErrors'
import { peopleOf } from '../../lib/people'
import { useAsync } from '../../lib/useAsync'
import { formatCents } from '../../domain/money'
import { ButtonLink, LoadError } from '../../components/ui'
import { TALON_BG } from '../../components/talonBg'
import { PersonDot } from './PersonDot'
import { ConfirmDeleteSheet } from './ConfirmDeleteSheet'

const T = es.expenses
const S = T.settlement
const longDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return longDate.format(Date.UTC(y, m - 1, d))
}

export function SettlementDetail() {
  const { id = '', settlementId = '' } = useParams()
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.user.id : null
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const data = useAsync(async () => {
    const [settlement, members] = await Promise.all([getSettlement(db, id, settlementId), listMembers(db, id)])
    return { settlement, members }
  }, [id, settlementId])

  if (data.status === 'loading') {
    return (
      <div aria-busy="true">
        <p className="sr-only" role="status">
          {es.common.loading}
        </p>
        <div aria-hidden className="h-56 animate-pulse rounded-xl bg-hoja" />
      </div>
    )
  }
  if (data.status === 'error') return <LoadError title={S.loadError} message={dataErrorMessage(data.error)} onRetry={data.reload} />
  const { settlement: s, members } = data.data
  if (!s) {
    return (
      <section className="mt-2 rounded-xl border-2 border-dashed border-trazo px-5 py-8 text-center">
        <h1 className="text-lg font-semibold">{S.notFoundTitle}</h1>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{S.notFoundBody}</p>
        <div className="mx-auto mt-6 max-w-xs">
          <ButtonLink to={`/grupos/${id}`}>{T.detail.toGroup}</ButtonLink>
        </div>
      </section>
    )
  }

  const people = peopleOf(members, me)
  const from = people.get(s.fromUser)
  const to = people.get(s.toUser)
  const author = people.get(s.createdBy)
  const gone = goneNames([s.fromUser, s.toUser], members)
  // Quien lo registró puede borrarlo, salvo si participa alguien que ya no está (RF-11: su saldo tiene que seguir en 0).
  const mine = s.createdBy === me && gone.length === 0
  const label = (p: typeof from) => (p?.isMe ? T.balances.yourself : (p?.name ?? T.someone))
  const done = () => navigate(`/grupos/${id}`, { replace: true, state: { notice: S.remove.done(formatCents(s.amountCents)) } })

  async function confirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteSettlement(db, s!.id)
      done()
    } catch (e) {
      if (isDataError(e, 'not-found')) return done() // ya borrado (p. ej. desde otro móvil)
      setError(dataErrorMessage(e))
      setDeleting(false)
    }
  }

  return (
    <>
      <section className="rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]">
        <div className={`${TALON_BG.cielo} rounded-t-xl px-5 pb-3 pt-4`}>
          <p className="text-[2.75rem] font-bold leading-none tracking-[-0.01em] tabular-nums">{formatCents(s.amountCents)}</p>
          <h1 className="mt-2 break-words text-lg font-semibold leading-snug">{to?.isMe ? S.rowToYou : S.rowTo(to?.name ?? T.someone)}</h1>
        </div>
        <div className={`troquel ${TALON_BG.cielo}`} style={{ backgroundImage: 'linear-gradient(to bottom, transparent 50%, var(--color-hoja) 50%)' }} aria-hidden />
        <div className="px-5 pb-5 pt-1">
          <p className="flex min-h-13 flex-wrap items-center gap-x-2.5 gap-y-1 font-semibold">
            <span className="inline-flex items-center gap-2">
              <PersonDot person={from} size="sm" />
              {label(from)}
            </span>
            <ArrowRight aria-hidden className="size-5 text-tinta-tenue" strokeWidth={2.25} />
            <span className="sr-only">{S.pays}</span>
            <span className="inline-flex items-center gap-2">
              <PersonDot person={to} size="sm" />
              {label(to)}
            </span>
          </p>
          <p className="text-tinta-suave">{S.on(formatDay(s.date))}</p>
        </div>
      </section>
      <p className="mx-0.5 mt-3 text-[0.8125rem] text-tinta-suave">{s.createdBy === me ? S.addedByYou : S.addedBy(author?.name ?? T.someone)}</p>
      {mine ? (
        <>
          <button
            ref={deleteButton}
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              setError(null)
              setSheetOpen(true)
            }}
            className="mt-3.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-sello/40 bg-white px-4 text-base font-semibold text-sello transition-colors duration-150 hover:bg-sello-claro active:bg-sello-claro"
          >
            <Trash2 aria-hidden className="size-5" />
            {S.remove.action}
          </button>
          <ConfirmDeleteSheet
            open={sheetOpen}
            onClose={() => {
              setSheetOpen(false)
              deleteButton.current?.focus()
            }}
            onConfirm={() => void confirmDelete()}
            description={to?.isMe ? S.rowToYou : S.rowTo(to?.name ?? T.someone)}
            amountCents={s.amountCents}
            deleting={deleting}
            error={error}
            text={S.remove}
          />
        </>
      ) : gone.length > 0 ? (
        <ReadOnlyNote>{T.readOnly.settlement(gone)}</ReadOnlyNote>
      ) : (
        <p className="mx-0.5 mt-1 text-[0.8125rem] text-tinta-suave">{S.onlyCreator(author?.name ?? T.someone)}</p>
      )}
    </>
  )
}
