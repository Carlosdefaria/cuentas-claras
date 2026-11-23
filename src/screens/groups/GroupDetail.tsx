// Detalle de grupo: nombre, «Invitar» (hoja inferior) y pestañas Gastos · Saldos · Miembros (PRD §7) · Actividad
// (RF-10), con la pestaña en la URL (?seccion=). Estados: cargando, no encontrado, error con Reintentar. Todo desde la red, sin caché.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { UserPlus } from 'lucide-react'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { getGroup, listMembers, type GroupDetail as Group, type Member } from '../../lib/groups'
import { balancesOf, listExpenses, listSettlements, type ExpenseRow } from '../../lib/expenses'
import { peopleOf } from '../../lib/people'
import type { Settlement } from '../../domain/balances'
import { ExpensesPanel } from '../expenses/ExpensesPanel'
import { BalancesPanel } from '../expenses/BalancesPanel'
import { ActivityPanel } from '../expenses/ActivityPanel'
import { dataErrorMessage } from '../../lib/dataErrors'
import { inviteUrl } from '../../lib/invite'
import { initialOf, memberTalones, talonFor } from '../../lib/talon'
import { useAsync } from '../../lib/useAsync'
import { ButtonLink, LoadError } from '../../components/ui'
import { TALON_BG } from '../../components/talonBg'
import { InstallHelp } from '../../pwa/InstallHelp'
import { InviteSheet } from './InviteSheet'

const T = es.groups.detail

export function GroupDetail() {
  const { id = '' } = useParams()
  const data = useAsync(async () => {
    const [group, members, expenses, settlements] = await Promise.all([
      getGroup(db, id),
      listMembers(db, id),
      listExpenses(db, id),
      listSettlements(db, id),
    ])
    return { group, members, expenses, settlements }
  }, [id])

  if (data.status === 'loading') return <DetailSkeleton />
  if (data.status === 'error') return <LoadError title={T.loadError} message={dataErrorMessage(data.error)} onRetry={data.reload} />
  if (!data.data.group) {
    return (
      <section className="mt-2 rounded-xl border-2 border-dashed border-trazo px-5 py-8 text-center">
        <h1 className="text-lg font-semibold">{T.notFoundTitle}</h1>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{T.notFoundBody}</p>
        <div className="mx-auto mt-6 max-w-xs">
          <ButtonLink to="/">{T.toGroups}</ButtonLink>
        </div>
      </section>
    )
  }
  return <Loaded group={data.data.group} members={data.data.members} expenses={data.data.expenses} settlements={data.data.settlements} />
}

type Tab = 'expenses' | 'balances' | 'members' | 'activity'
const TABS: { id: Tab; label: string; param: string }[] = [
  { id: 'expenses', label: T.expenses, param: 'gastos' },
  { id: 'balances', label: T.balances, param: 'saldos' },
  { id: 'members', label: T.membersTab, param: 'miembros' },
  { id: 'activity', label: T.activityTab, param: 'actividad' },
]

function Loaded({ group, members, expenses, settlements }: { group: Group; members: Member[]; expenses: ExpenseRow[]; settlements: Settlement[] }) {
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.user.id : null
  const [params, setParams] = useSearchParams()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [welcome] = useState(() => params.get('bienvenida') === '1')
  // Recién borrado un gasto (estado de la navegación desde su detalle): aviso, y se limpia para que no vuelva a salir.
  const location = useLocation()
  const navigate = useNavigate()
  const [deleted] = useState(() => (location.state as { deleted?: string } | null)?.deleted ?? null)
  const tab: Tab = TABS.find((t) => t.param === params.get('seccion'))?.id ?? 'expenses'
  const setTab = (next: Tab) => {
    const param = TABS.find((t) => t.id === next)!.param
    setParams(param === 'gastos' ? {} : { seccion: param }, { replace: true })
  }
  const inviteButton = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ expenses: null, balances: null, members: null, activity: null })
  const baseId = useId()
  const url = inviteUrl(window.location.origin, group.inviteCode)

  // Recién creado (?invitar=1): se abre «Invitar». Recién unido (?bienvenida=1): aviso. Se limpian de la URL.
  useEffect(() => {
    if (params.get('invitar') === '1') setInviteOpen(true)
    if (params.has('invitar') || params.has('bienvenida')) {
      const seccion = params.get('seccion')
      setParams(seccion ? { seccion } : {}, { replace: true })
    }
    if (deleted) navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = event.key === 'ArrowRight' ? i + 1 : event.key === 'ArrowLeft' ? i - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null
    if (next === null) return
    event.preventDefault()
    const target = TABS[(next + TABS.length) % TABS.length].id
    setTab(target)
    tabRefs.current[target]?.focus()
  }

  const talones = memberTalones(members)
  const people = peopleOf(members, me)
  const balances = balancesOf(members.map((m) => m.userId), expenses, settlements)

  return (
    <>
      {deleted && (
        <p role="status" className="mb-5 break-words rounded-lg bg-loteria-claro px-3.5 py-3 font-semibold text-loteria-hondo">
          {es.expenses.remove.done(deleted)}
        </p>
      )}
      {welcome && (
        <div className="mb-5 space-y-3">
          <p role="status" className="rounded-lg bg-loteria-claro px-3.5 py-3 font-semibold text-loteria-hondo">
            {T.welcome(group.name)}
          </p>
          <InstallHelp context="cuenta" />
        </div>
      )}

      <h1 className="break-words font-rotulo text-[2rem] font-bold uppercase leading-[1.02] tracking-[0.01em]">{group.name}</h1>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-tinta-suave">
          {es.groups.members(members.length)} · {es.groups.currency}
        </p>
        <button
          ref={inviteButton}
          type="button"
          onClick={() => setInviteOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex h-11 flex-none items-center gap-1.5 rounded-lg border border-trazo bg-white px-3.5 text-[0.9375rem] font-semibold text-loteria transition-colors duration-150 hover:bg-papel active:bg-papel-hondo"
        >
          <UserPlus aria-hidden className="size-5" />
          {T.invite}
        </button>
      </div>

      <div role="tablist" aria-label={T.sections} className="mt-5 flex rounded-[0.625rem] bg-papel-hondo p-0.75">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
            className={`h-11 min-w-0 flex-1 rounded-lg px-1 text-[0.8125rem] font-semibold min-[360px]:text-sm transition-colors duration-150 ${
              tab === t.id ? 'bg-hoja text-tinta shadow-[0_1px_2px_rgb(19_38_29/0.08)]' : 'text-tinta-tenue hover:text-tinta'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`${baseId}-panel-${t.id}`} aria-labelledby={`${baseId}-tab-${t.id}`} hidden={tab !== t.id} className="mt-4">
          {t.id === 'members' ? (
            <>
              <ul className="divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
                {members.map((m, i) => (
                  <li key={m.userId} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
                    <span aria-hidden className={`flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold ${TALON_BG[talones[i]]}`}>
                      {initialOf(m.name)}
                    </span>
                    <span className="min-w-0 flex-1 break-words font-semibold">{m.name}</span>
                    <span className="flex-none text-sm text-tinta-suave">
                      {[m.userId === me ? T.you : null, m.role === 'admin' ? T.admin : null].filter(Boolean).join(' · ') || T.member}
                    </span>
                  </li>
                ))}
              </ul>
              {members.length === 1 && <p className="mt-3 text-center text-tinta-suave">{T.alone}</p>}
            </>
          ) : t.id === 'activity' ? (
            tab === 'activity' && <ActivityPanel groupId={group.id} people={people} aliveExpenses={new Set(expenses.map((e) => e.id))} />
          ) : t.id === 'expenses' ? (
            <ExpensesPanel groupId={group.id} expenses={expenses} people={people} me={me} />
          ) : (
            <BalancesPanel balances={balances} people={people} me={me} expenses={expenses} settlements={settlements} />
          )}
        </div>
      ))}

      <InviteSheet
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false)
          inviteButton.current?.focus()
        }}
        groupName={group.name}
        url={url}
        tint={talonFor(group.id)}
      />
    </>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        {T.loading}
      </p>
      <div aria-hidden className="animate-pulse">
        <div className="h-8 w-3/4 rounded bg-papel-hondo" />
        <div className="mt-3 flex items-center justify-between">
          <div className="h-4 w-1/3 rounded bg-papel-hondo" />
          <div className="h-11 w-28 rounded-lg bg-loteria-claro" />
        </div>
        <div className="mt-5 h-12 rounded-[0.625rem] bg-papel-hondo" />
        <div className="mt-4 divide-y divide-papel-hondo rounded-xl bg-hoja">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-3.5">
              <div className="size-9 rounded-full bg-papel-hondo" />
              <div className="h-4 w-1/3 rounded bg-papel-hondo" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
