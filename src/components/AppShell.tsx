// Armazón autenticado: barra superior y barra inferior de secciones (respeta la barra de inicio de iOS).

import { NavLink, Outlet } from 'react-router'
import { UserRound, UsersRound } from 'lucide-react'
import { es } from '../i18n/es'
import { TopBar } from './ui'

const tabs = [
  { to: '/', label: es.nav.groups, Icon: UsersRound, end: true },
  { to: '/cuenta', label: es.nav.account, Icon: UserRound, end: false },
]

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6">
        <Outlet />
      </main>
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 border-t border-trazo bg-hoja pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-md">
          {tabs.map(({ to, label, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors duration-150 ${
                    isActive ? 'text-loteria' : 'text-tinta-tenue hover:text-tinta'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon aria-hidden className="size-6" strokeWidth={isActive ? 2.25 : 1.75} />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
