// Pestaña Miembros (RF-11, variante C «Ficha de persona»): quienes están, por orden de llegada, y al final quienes ya no
// están (no se borran: su nombre sigue en el historial). Quien administra toca a alguien para abrir su ficha (saldo y
// «Quitar del grupo», o por qué aún no se puede) y tiene «Borrar grupo…» al final. Las reglas, en src/domain/members.ts;
// la BD (remove_member, delete_group) las vuelve a comprobar.

import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, ChevronRight, Lock, Trash2, UserMinus } from 'lucide-react'
import { es } from '../../i18n/es'
import { db } from '../../lib/data'
import { deleteGroup, removeMember, type Member } from '../../lib/groups'
import { dataErrorMessage, isDataError } from '../../lib/dataErrors'
import { localDateOf, localToday, shortDay } from '../../lib/dates'
import type { Person } from '../../lib/people'
import { initialOf } from '../../lib/talon'
import { formatCents } from '../../domain/money'
import { balanceKind } from '../../domain/balanceText'
import { canDeleteGroup, canRemoveMember, isAdmin } from '../../domain/members'
import { Alert, Button } from '../../components/ui'
import { BottomSheet, SheetSecondaryButton } from '../../components/BottomSheet'
import { TALON_BG } from '../../components/talonBg'

const T = es.groups.detail
const M = es.groups.manage
const B = es.expenses.balances
const TONE = { owed: 'text-favor', owes: 'text-sello', settled: 'text-tinta-suave' } as const

const balanceText = (cents: number, isMe = false) => {
  const k = balanceKind(cents)
  if (isMe) return k === 'owed' ? B.youAreOwed(formatCents(cents)) : k === 'owes' ? B.youOwe(formatCents(-cents)) : B.youSettled
  return k === 'owed' ? B.isOwed(formatCents(cents)) : k === 'owes' ? B.owes(formatCents(-cents)) : B.settled
}

export function MembersPanel({
  groupId,
  groupName,
  members,
  people,
  balances,
  me,
  onRemoved,
  onShowBalances,
}: {
  groupId: string
  groupName: string
  /** Todos, también quienes ya no están (removedAt). */
  members: Member[]
  people: Map<string, Person>
  /** Saldos de quienes siguen (computeBalances). */
  balances: Map<string, number>
  me: string | null
  onRemoved: (name: string) => void
  onShowBalances: () => void
}) {
  const [selected, setSelected] = useState<Member | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const deleteButton = useRef<HTMLButtonElement>(null)
  const admin = isAdmin(members, me)
  const active = members.filter((m) => m.removedAt === null)
  const gone = members.filter((m) => m.removedAt !== null)

  const dot = (m: Member) => {
    const p = people.get(m.userId)
    return (
      <span
        aria-hidden
        className={`flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold ${
          m.removedAt ? 'border-2 border-dashed border-trazo text-tinta-tenue' : p ? TALON_BG[p.talon] : 'bg-papel-hondo'
        }`}
      >
        {initialOf(m.name)}
      </span>
    )
  }
  const role = (m: Member) => [m.userId === me ? T.you : null, m.role === 'admin' ? T.admin : null].filter(Boolean).join(' · ') || T.member
  const rowClass = 'flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left'

  return (
    <>
      <ul className="divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
        {active.map((m) => {
          const content = (
            <>
              {dot(m)}
              <span className="min-w-0 flex-1 break-words font-semibold">{m.name}</span>
              <span className="flex-none text-sm text-tinta-suave">{role(m)}</span>
            </>
          )
          const tappable = admin && m.userId !== me
          return (
            <li key={m.userId}>
              {tappable ? (
                <button
                  ref={(el) => {
                    rowRefs.current[m.userId] = el
                  }}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setSelected(m)}
                  className={`${rowClass} transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-white active:bg-papel`}
                >
                  {content}
                  <ChevronRight aria-hidden className="size-5 flex-none text-tinta-tenue" />
                </button>
              ) : (
                <div className={rowClass}>
                  {content}
                  {admin && <span aria-hidden className="w-5 flex-none" />}
                </div>
              )}
            </li>
          )
        })}
        {gone.map((m) => (
          <li key={m.userId} className={rowClass}>
            {dot(m)}
            <span className="min-w-0 flex-1 break-words font-semibold text-tinta-suave">{m.name}</span>
            <span className="flex-none text-sm text-tinta-tenue">{M.gone}</span>
            {admin && <span aria-hidden className="w-5 flex-none" />}
          </li>
        ))}
      </ul>
      {active.length === 1 && <p className="mt-3 text-center text-tinta-suave">{T.alone}</p>}
      {admin && active.length > 1 && <p className="mx-0.5 mt-2 text-[0.8125rem] text-tinta-suave">{M.hint}</p>}

      {admin && (
        <div className="mt-10 text-center">
          <button
            ref={deleteButton}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-sello underline decoration-sello/40 underline-offset-4 transition-colors duration-150 hover:bg-sello-claro"
          >
            {M.deleteGroup.action}
          </button>
        </div>
      )}

      {admin && (
        <>
          <PersonSheet
            groupId={groupId}
            member={selected}
            person={selected ? people.get(selected.userId) : undefined}
            check={selected ? canRemoveMember(members, me, selected.userId, balances) : null}
            balanceCents={selected ? (balances.get(selected.userId) ?? 0) : 0}
            onClose={() => {
              const id = selected?.userId
              setSelected(null)
              if (id) rowRefs.current[id]?.focus()
            }}
            onRemoved={(name) => {
              setSelected(null)
              onRemoved(name)
            }}
            onShowBalances={() => {
              setSelected(null)
              onShowBalances()
            }}
          />
          <DeleteGroupSheet
            open={deleteOpen}
            groupId={groupId}
            groupName={groupName}
            check={canDeleteGroup(members, me, balances)}
            people={people}
            memberCount={active.length}
            onClose={() => {
              setDeleteOpen(false)
              deleteButton.current?.focus()
            }}
            onShowBalances={() => {
              setDeleteOpen(false)
              onShowBalances()
            }}
          />
        </>
      )}
    </>
  )
}

/** Ficha de una persona para quien administra: su saldo y «Quitar del grupo», o por qué aún no se puede. */
function PersonSheet({
  groupId,
  member,
  person,
  check,
  balanceCents,
  onClose,
  onRemoved,
  onShowBalances,
}: {
  groupId: string
  member: Member | null
  person: Person | undefined
  check: ReturnType<typeof canRemoveMember> | null
  balanceCents: number
  onClose: () => void
  onRemoved: (name: string) => void
  onShowBalances: () => void
}) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastId, setLastId] = useState<string | null>(null)
  // Al abrir la ficha de otra persona, sin el error de la anterior.
  if ((member?.userId ?? null) !== lastId) {
    setLastId(member?.userId ?? null)
    setError(null)
    setRemoving(false)
  }

  async function remove() {
    if (!member) return
    setRemoving(true)
    setError(null)
    try {
      await removeMember(db, groupId, member.userId)
      onRemoved(member.name)
    } catch (e) {
      setError(dataErrorMessage(e))
      setRemoving(false)
    }
  }

  const blocked = check?.ok === false && check.reason === 'unsettled'
  const k = balanceKind(balanceCents)
  return (
    <BottomSheet
      open={member !== null}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={bodyId}
      closeLabel={M.close}
      busy={removing}
      initialFocus={cancelRef}
    >
      {member && (
        <>
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className={`flex size-14 flex-none items-center justify-center rounded-full text-xl font-bold ${person ? TALON_BG[person.talon] : 'bg-papel-hondo'}`}
            >
              {initialOf(member.name)}
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="break-words font-rotulo text-[1.5rem] font-bold uppercase leading-[1.05] tracking-[0.01em]">
                {member.name}
              </h2>
              <p className="text-sm text-tinta-suave">{M.since(shortDay(localDateOf(member.joinedAt), localToday()))}</p>
            </div>
          </div>
          <p className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-white px-3.5 py-3 shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
            <span className="font-semibold text-tinta-suave">{M.balance}</span>
            <span className={`text-xl font-bold tabular-nums ${TONE[k]}`}>{balanceText(balanceCents)}</span>
          </p>
          {blocked ? (
            <>
              <p id={bodyId} className="mt-3 flex gap-2.5 rounded-lg bg-papel px-3.5 py-3 text-tinta-suave">
                <Lock aria-hidden className="mt-0.5 size-5 flex-none" />
                <span>{M.remove.blocked(member.name)}</span>
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <Button onClick={onShowBalances}>{M.showBalances}</Button>
                <SheetSecondaryButton buttonRef={cancelRef} onClick={onClose}>
                  {M.close}
                </SheetSecondaryButton>
              </div>
            </>
          ) : (
            <>
              <p id={bodyId} className="mt-3 text-tinta-suave">
                {M.remove.body}
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                {error && <Alert>{error}</Alert>}
                <Button tone="destructivo" loading={removing} onClick={() => void remove()}>
                  {!removing && <UserMinus aria-hidden className="size-5" />}
                  {removing ? M.remove.removing : M.remove.confirm(member.name)}
                </Button>
                <SheetSecondaryButton buttonRef={cancelRef} onClick={onClose} disabled={removing}>
                  {M.cancel}
                </SheetSecondaryButton>
              </div>
            </>
          )}
        </>
      )}
    </BottomSheet>
  )
}

/** «¿Borrar <grupo>?»: con todos en paz, la confirmación; si no, quién tiene saldo pendiente. */
function DeleteGroupSheet({
  open,
  groupId,
  groupName,
  check,
  people,
  memberCount,
  onClose,
  onShowBalances,
}: {
  open: boolean
  groupId: string
  groupName: string
  check: ReturnType<typeof canDeleteGroup>
  people: Map<string, Person>
  memberCount: number
  onClose: () => void
  onShowBalances: () => void
}) {
  const navigate = useNavigate()
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const D = M.deleteGroup
  const done = () => navigate('/', { replace: true, state: { notice: D.done(groupName) } })

  async function confirm() {
    setDeleting(true)
    setError(null)
    try {
      await deleteGroup(db, groupId)
      done()
    } catch (e) {
      if (isDataError(e, 'not-found')) return done() // ya borrado (p. ej. desde otro móvil)
      setError(dataErrorMessage(e))
      setDeleting(false)
    }
  }

  const pending = check.ok === false && check.reason === 'unsettled' ? check.pending : []
  const ready = check.ok
  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setError(null)
        onClose()
      }}
      labelledBy={titleId}
      describedBy={bodyId}
      closeLabel={M.close}
      busy={deleting}
      initialFocus={cancelRef}
    >
      <section className="rounded-xl border border-papel-hondo bg-hoja">
        <div className={`${TALON_BG.salmon} rounded-t-xl px-4 pb-2 pt-4`}>
          <h2 id={titleId} className="break-words font-rotulo text-[1.5rem] font-bold uppercase leading-[1.05] tracking-[0.01em]">
            {D.title(groupName)}
          </h2>
        </div>
        <div
          aria-hidden
          className={`troquel ${TALON_BG.salmon}`}
          style={{ backgroundImage: 'linear-gradient(to bottom, transparent 50%, var(--color-hoja) 50%)', ['--troquel-fondo' as string]: 'var(--color-hoja)' }}
        />
        <div className="px-4 pb-4 pt-1">
          {ready ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-favor">
                <Check aria-hidden className="size-5 flex-none" strokeWidth={2.25} />
                {D.allSettled}
              </p>
              <p id={bodyId} className="mt-2 text-tinta-suave">
                {D.body(memberCount)}
              </p>
            </>
          ) : (
            <>
              <p id={bodyId} className="flex gap-2.5 text-tinta-suave">
                <Lock aria-hidden className="mt-0.5 size-5 flex-none" />
                <span>{D.blocked}</span>
              </p>
              <ul className="mt-3 divide-y divide-papel-hondo rounded-lg bg-white">
                {pending.map((p) => {
                  const person = people.get(p.userId)
                  return (
                    <li key={p.userId} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0 break-words font-semibold">{person?.isMe ? B.yourself : (person?.name ?? es.expenses.someone)}</span>
                      <span className={`flex-none font-semibold tabular-nums ${TONE[balanceKind(p.balanceCents)]}`}>{balanceText(p.balanceCents, person?.isMe)}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </section>
      <div className="mt-5 flex flex-col gap-2.5">
        {error && <Alert>{error}</Alert>}
        {ready ? (
          <Button tone="destructivo" loading={deleting} onClick={() => void confirm()}>
            {!deleting && <Trash2 aria-hidden className="size-5" />}
            {deleting ? D.deleting : D.confirm}
          </Button>
        ) : (
          <Button onClick={onShowBalances}>{M.showBalances}</Button>
        )}
        <SheetSecondaryButton
          buttonRef={cancelRef}
          onClick={() => {
            setError(null)
            onClose()
          }}
          disabled={deleting}
        >
          {ready ? M.cancel : M.close}
        </SheetSecondaryButton>
      </div>
    </BottomSheet>
  )
}
