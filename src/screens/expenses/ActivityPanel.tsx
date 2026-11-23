// Pestaña Actividad (RF-10, variante A): qué ha pasado en el grupo, de lo más reciente a lo más antiguo, por días,
// con autor y hora. Gastos añadidos, editados (con el antes → después) y borrados, y quién se une. Desde la red, sin
// caché; páginas de 50 con «Ver más». Un gasto que sigue vivo se abre tocando su fila.

import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { es } from '../../i18n/es'
import { db } from '../../lib/data'
import { listActivity, type ActivityItem } from '../../lib/expenses'
import { dataErrorMessage } from '../../lib/dataErrors'
import { dayLabel, groupByDay, localDateOf, localToday, shortDay, timeOf } from '../../lib/dates'
import type { Person } from '../../lib/people'
import { useAsync } from '../../lib/useAsync'
import { formatCents } from '../../domain/money'
import type { ActivityChange } from '../../domain/activity'
import { LoadError } from '../../components/ui'
import { PersonDot } from './PersonDot'

const T = es.activity
const list = new Intl.ListFormat('es', { type: 'conjunction' })

export function ActivityPanel({
  groupId,
  people,
  aliveExpenses,
}: {
  groupId: string
  people: Map<string, Person>
  /** Gastos vivos del grupo: sus filas enlazan al detalle. */
  aliveExpenses: ReadonlySet<string>
}) {
  const first = useAsync(() => listActivity(db, groupId), [groupId])
  const [more, setMore] = useState<{ items: ActivityItem[]; nextBefore: number | null } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  if (first.status === 'loading') return <ActivitySkeleton />
  if (first.status === 'error') return <LoadError title={T.loadError} message={dataErrorMessage(first.error)} onRetry={first.reload} />

  const items = [...first.data.items, ...(more?.items ?? [])]
  const nextBefore = more ? more.nextBefore : first.data.nextBefore

  async function loadMore() {
    if (nextBefore === null) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await listActivity(db, groupId, { before: nextBefore })
      setMore((prev) => ({ items: [...(prev?.items ?? []), ...page.items], nextBefore: page.nextBefore }))
    } catch (e) {
      setMoreError(dataErrorMessage(e))
    } finally {
      setLoadingMore(false)
    }
  }

  if (items.length === 0 && nextBefore === null) {
    return (
      <section className="rounded-xl border-2 border-dashed border-trazo px-5 py-7 text-center">
        <h2 className="text-lg font-semibold">{T.emptyTitle}</h2>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{T.emptyBody}</p>
      </section>
    )
  }

  const today = localToday()
  return (
    <>
      {groupByDay(items, (i) => localDateOf(i.createdAt)).map((day, index) => (
        <section key={day.date} aria-label={dayLabel(day.date, today)} className="[contain-intrinsic-size:auto_240px] [content-visibility:auto]">
          <h2 className={`mx-0.5 mb-2 text-sm font-semibold text-tinta-suave ${index === 0 ? 'mt-1' : 'mt-5'}`}>{dayLabel(day.date, today)}</h2>
          <ul className="divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
            {day.items.map((item) => (
              <li key={item.id}>
                <Row item={item} groupId={groupId} people={people} alive={'expenseId' in item.event && aliveExpenses.has(item.event.expenseId)} today={today} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {nextBefore !== null && (
        <div className="mt-4 flex flex-col gap-2">
          {moreError && <p role="alert" className="text-center text-sm font-medium text-sello">{moreError}</p>}
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            aria-busy={loadingMore || undefined}
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-trazo bg-white px-4 text-base font-semibold text-loteria transition-colors duration-150 hover:bg-papel active:bg-papel-hondo disabled:opacity-60"
          >
            {loadingMore ? T.loadingMore : T.more}
          </button>
        </div>
      )}
    </>
  )
}

function Row({ item, groupId, people, alive, today }: { item: ActivityItem; groupId: string; people: Map<string, Person>; alive: boolean; today: string }) {
  const actor = people.get(item.actor)
  const me = actor?.isMe === true
  const name = me ? T.you : (actor?.name ?? es.expenses.someone)
  const lower = (userId: string) => {
    const p = people.get(userId)
    return p?.isMe ? T.youLower : (p?.name ?? es.expenses.someone)
  }
  const { event } = item

  let sentence: ReactNode
  let detail: ReactNode = null
  const verb = (v: { me: string; other: string }) => (me ? v.me : v.other)
  switch (event.kind) {
    case 'expense_created':
      sentence = <>{verb(T.created)} «{event.description}»</>
      detail = formatCents(event.amountCents)
      break
    case 'expense_updated':
      sentence = <>{verb(T.updated)} «{event.description}»</>
      detail = changesText(event.changes, lower, today)
      break
    case 'expense_deleted':
      sentence = <>{verb(T.deleted)} «{event.description}»</>
      detail = (
        <>
          <s className="text-tinta-tenue">{formatCents(event.amountCents)}</s>
          {event.paidBy && <> · {people.get(event.paidBy)?.isMe ? T.paidByYou : T.paidBy(lower(event.paidBy))}</>}
        </>
      )
      break
    case 'member_joined':
      sentence = verb(T.joined)
      break
    case 'group_created':
      sentence = verb(T.groupCreated)
      break
  }

  const body = (
    <>
      <PersonDot person={actor} />
      <span className="min-w-0 flex-1">
        <span className="block break-words leading-snug">
          <b className="font-semibold">{name}</b> {sentence}
        </span>
        {detail && <span className="mt-0.5 block break-words text-sm text-tinta-suave tabular-nums">{detail}</span>}
      </span>
      <time dateTime={item.createdAt} className="flex-none pt-0.5 text-[0.8125rem] text-tinta-tenue tabular-nums">
        {timeOf(item.createdAt)}
      </time>
    </>
  )
  const layout = 'flex min-h-14 items-start gap-3 px-3.5 py-2.5'
  if (alive && 'expenseId' in event) {
    return (
      <Link
        to={`/grupos/${groupId}/gastos/${event.expenseId}`}
        className={`${layout} transition-colors duration-150 hover:bg-white active:bg-papel`}
      >
        {body}
      </Link>
    )
  }
  return <div className={layout}>{body}</div>
}

/** «36,00 € → 42,50 € · pagó Ana → tú · entra Marta». */
function changesText(changes: ActivityChange[], nameOf: (userId: string) => string, today: string): string {
  return changes
    .flatMap((c): string[] => {
      switch (c.field) {
        case 'amount':
          return [`${formatCents(c.from)} → ${formatCents(c.to)}`]
        case 'description':
          return [T.descriptionWas(c.from)]
        case 'paidBy':
          return [T.payerChange(nameOf(c.from), nameOf(c.to))]
        case 'date':
          return [T.dateChange(shortDay(c.from, today), shortDay(c.to, today))]
        case 'participants':
          return [
            ...(c.added.length ? [T.joins(list.format(c.added.map(nameOf)), c.added.length)] : []),
            ...(c.removed.length ? [T.leaves(list.format(c.removed.map(nameOf)), c.removed.length)] : []),
          ]
        case 'split':
          return [T.split]
      }
    })
    .join(' · ')
}

function ActivitySkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        {T.loading}
      </p>
      <div aria-hidden className="animate-pulse">
        <div className="mx-0.5 mb-2 mt-1 h-4 w-24 rounded bg-papel-hondo" />
        <div className="divide-y divide-papel-hondo rounded-xl bg-hoja">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-3.5">
              <div className="size-8 rounded-full bg-papel-hondo" />
              <div className="h-4 w-2/3 rounded bg-papel-hondo" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

