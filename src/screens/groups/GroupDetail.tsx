// Detalle de grupo: nombre, miembros y «Invitar» (hoja inferior). Las pestañas Gastos y Saldos (PRD §7) ya están
// en su sitio; su contenido llega con los gastos. Estados: cargando, no encontrado, error con Reintentar.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { UserPlus } from 'lucide-react'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { getGroup, listMembers, type GroupDetail as Group, type Member } from '../../lib/groups'
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
    const [group, members] = await Promise.all([getGroup(db, id), listMembers(db, id)])
    return { group, members }
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
  return <Loaded group={data.data.group} members={data.data.members} />
}

type Tab = 'expenses' | 'balances' | 'members'
const TABS: { id: Tab; label: string }[] = [
  { id: 'expenses', label: T.expenses },
  { id: 'balances', label: T.balances },
  { id: 'members', label: T.membersTab },
]

function Loaded({ group, members }: { group: Group; members: Member[] }) {
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.user.id : null
  const [params, setParams] = useSearchParams()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [welcome] = useState(() => params.get('bienvenida') === '1')
  const [tab, setTab] = useState<Tab>('members')
  const inviteButton = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ expenses: null, balances: null, members: null })
  const baseId = useId()
  const url = inviteUrl(window.location.origin, group.inviteCode)

  // Recién creado (?invitar=1): se abre «Invitar». Recién unido (?bienvenida=1): aviso. Se limpian de la URL.
  useEffect(() => {
    if (params.get('invitar') === '1') setInviteOpen(true)
    if (params.has('invitar') || params.has('bienvenida')) setParams({}, { replace: true })
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

  return (
    <>
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
          className="inline-flex h-11 flex-none items-center gap-1.5 rounded-lg bg-loteria px-3.5 text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-loteria-hondo active:bg-loteria-hondo"
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
            className={`h-11 flex-1 rounded-lg text-sm font-semibold transition-colors duration-150 ${
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
          ) : (
            <p className="rounded-xl border-2 border-dashed border-trazo px-5 py-7 text-center text-tinta-suave">
              {t.id === 'expenses' ? T.expensesSoon : T.balancesSoon}
            </p>
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
