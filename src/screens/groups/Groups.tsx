// Grupos: arriba las dos acciones (crear y unirse con un enlace), debajo la lista compacta de mis grupos.
// Estados: cargando (esqueleto), vacío, error con Reintentar. Siempre desde la red (Data API + RLS).

import { Link } from 'react-router'
import { ChevronRight, Link2, Plus } from 'lucide-react'
import { es } from '../../i18n/es'
import { db } from '../../lib/data'
import { listMyGroups, type GroupSummary } from '../../lib/groups'
import { dataErrorMessage } from '../../lib/dataErrors'
import { initialOf, talonFor } from '../../lib/talon'
import { useAsync } from '../../lib/useAsync'
import { LoadError, SectionTitle } from '../../components/ui'
import { TALON_BG } from '../../components/talonBg'

const T = es.groups

export function Groups() {
  const groups = useAsync(() => listMyGroups(db), [])

  return (
    <>
      <SectionTitle>{T.title}</SectionTitle>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Link
          to="/grupos/nuevo"
          className="flex min-h-22 flex-col justify-between rounded-xl bg-loteria p-3.5 font-semibold text-white transition-colors duration-150 hover:bg-loteria-hondo active:bg-loteria-hondo"
        >
          <Plus aria-hidden className="size-6" strokeWidth={2.25} />
          {T.newGroup}
        </Link>
        <Link
          to="/unirse"
          className="flex min-h-22 flex-col justify-between rounded-xl bg-hoja p-3.5 font-semibold text-loteria shadow-[0_1px_2px_rgb(19_38_29/0.08)] transition-colors duration-150 hover:bg-white active:bg-papel-hondo"
        >
          <Link2 aria-hidden className="size-6" strokeWidth={2} />
          {T.joinWithLink}
        </Link>
      </div>

      <h2 className="mt-7 text-[0.9375rem] font-semibold">{T.yourGroups}</h2>
      {groups.status === 'loading' && <GroupsSkeleton />}
      {groups.status === 'error' && <LoadError title={T.loadError} message={dataErrorMessage(groups.error)} onRetry={groups.reload} />}
      {groups.status === 'ready' && groups.data.length === 0 && (
        <section className="mt-3 rounded-xl border-2 border-dashed border-trazo px-5 py-7 text-center">
          <p className="text-lg font-semibold">{T.emptyTitle}</p>
          <p className="mx-auto mt-1.5 max-w-[32ch] text-tinta-suave">{T.emptyBody}</p>
        </section>
      )}
      {groups.status === 'ready' && groups.data.length > 0 && <GroupList groups={groups.data} />}
    </>
  )
}

function GroupList({ groups }: { groups: GroupSummary[] }) {
  return (
    <ul className="mt-3 divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
      {groups.map((g) => (
        <li key={g.id}>
          <Link
            to={`/grupos/${g.id}`}
            className="flex min-h-16 items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-white active:bg-papel"
          >
            <span
              aria-hidden
              className={`flex size-10 flex-none items-center justify-center rounded-lg font-rotulo text-[1.375rem] font-bold text-tinta ${TALON_BG[talonFor(g.id)]}`}
            >
              {initialOf(g.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold leading-snug">{g.name}</span>
              <span className="block text-sm text-tinta-suave">{T.members(g.memberCount)}</span>
            </span>
            <ChevronRight aria-hidden className="size-5 flex-none text-tinta-tenue" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function GroupsSkeleton() {
  return (
    <div className="mt-3" aria-busy="true">
      <p className="sr-only" role="status">
        {T.loading}
      </p>
      <div aria-hidden className="animate-pulse divide-y divide-papel-hondo rounded-xl bg-hoja">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-16 items-center gap-3 px-3.5">
            <div className="size-10 rounded-lg bg-papel-hondo" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-papel-hondo" />
              <div className="h-3 w-1/4 rounded bg-papel" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
