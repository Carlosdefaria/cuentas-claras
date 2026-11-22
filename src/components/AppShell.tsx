// Armazón autenticado: barra superior y barra inferior de secciones (respeta la barra de inicio de iOS).
// Las rutas secundarias declaran su destino de «Volver» con `handle: { back: '/' }` (o una función de los params).

import type { ReactNode } from 'react'
import { NavLink, Outlet, useMatches } from 'react-router'
import { UserRound, UsersRound } from 'lucide-react'
import { es } from '../i18n/es'
import { TopBar } from './ui'

const tabs = [
  { to: '/', label: es.nav.groups, Icon: UsersRound, end: false, match: (p: string) => p === '/' || p.startsWith('/grupos') || p.startsWith('/unirse') },
  { to: '/cuenta', label: es.nav.account, Icon: UserRound, end: false, match: (p: string) => p.startsWith('/cuenta') },
]

export function AppFrame({ back, children }: { back?: string; children: ReactNode }) {
  const matches = useMatches()
  const path = matches.at(-1)?.pathname ?? '/'
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back={back} />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
        {children}
      </main>
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-trazo bg-hoja pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-md">
          {tabs.map(({ to, label, Icon, match }) => {
            const isActive = match(path)
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors duration-150 ${
                    isActive ? 'text-loteria' : 'text-tinta-tenue hover:text-tinta'
                  }`}
                >
                  <Icon aria-hidden className="size-6" strokeWidth={isActive ? 2.25 : 1.75} />
                  {label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

export function AppShell() {
  const matches = useMatches()
  type Back = string | ((params: Record<string, string | undefined>) => string)
  const match = [...matches].reverse().find((m) => (m.handle as { back?: Back } | undefined)?.back)
  const raw = (match?.handle as { back?: Back } | undefined)?.back
  const back = typeof raw === 'function' ? raw(match!.params) : raw
  return (
    <AppFrame back={back}>
      <Outlet />
    </AppFrame>
  )
}
