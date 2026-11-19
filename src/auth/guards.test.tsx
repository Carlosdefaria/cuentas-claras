// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import type { SessionState } from './session'

let state: SessionState = { status: 'checking' }
vi.mock('./session', () => ({
  useSession: () => ({ state, refresh: vi.fn(async () => {}), signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn() }),
}))
vi.mock('../lib/auth', () => ({ authClient: {}, fetchSession: vi.fn() }))

const { GuestOnly, RequireAuth } = await import('./guards')

function WhereAmI() {
  const l = useLocation()
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { element: <GuestOnly />, children: [{ path: '/entrar', element: <WhereAmI /> }] },
      { element: <RequireAuth />, children: [{ path: '/', element: <WhereAmI /> }, { path: '/cuenta', element: <WhereAmI /> }] },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => cleanup())

describe('RequireAuth', () => {
  it('sin sesión en / → /entrar (sin redirectTo)', () => {
    state = { status: 'signed-out' }
    renderAt('/')
    expect(screen.getByTestId('where').textContent).toBe('/entrar')
  })

  it('sin sesión en /cuenta → /entrar?redirectTo=%2Fcuenta', () => {
    state = { status: 'signed-out' }
    renderAt('/cuenta')
    expect(screen.getByTestId('where').textContent).toBe('/entrar?redirectTo=%2Fcuenta')
  })

  it('tras cerrar sesión en /cuenta → /entrar sin redirectTo', () => {
    state = { status: 'signed-out', explicit: true }
    renderAt('/cuenta')
    expect(screen.getByTestId('where').textContent).toBe('/entrar')
  })

  it('con sesión muestra la ruta protegida', () => {
    state = { status: 'signed-in', user: { id: 'u1', name: 'Ana', email: 'ana@example.com' } }
    renderAt('/cuenta')
    expect(screen.getByTestId('where').textContent).toBe('/cuenta')
  })

  it('mientras comprueba la sesión muestra el estado de carga, no la ruta', () => {
    state = { status: 'checking' }
    renderAt('/cuenta')
    expect(screen.queryByTestId('where')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Comprobando/)
  })

  it('si falla la comprobación muestra el error con Reintentar', () => {
    state = { status: 'error', error: new TypeError('Failed to fetch') }
    renderAt('/cuenta')
    expect(screen.getByText(/No hay conexión/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })
})

describe('GuestOnly', () => {
  it('con sesión en /entrar?redirectTo=/cuenta → /cuenta', () => {
    state = { status: 'signed-in', user: { id: 'u1', name: 'Ana', email: 'ana@example.com' } }
    renderAt('/entrar?redirectTo=%2Fcuenta')
    expect(screen.getByTestId('where').textContent).toBe('/cuenta')
  })

  it('con sesión y redirectTo malicioso → inicio', () => {
    state = { status: 'signed-in', user: { id: 'u1', name: 'Ana', email: 'ana@example.com' } }
    renderAt('/entrar?redirectTo=%2F%2Fevil.com')
    expect(screen.getByTestId('where').textContent).toBe('/')
  })

  it('sin sesión muestra la pantalla de entrada', () => {
    state = { status: 'signed-out' }
    renderAt('/entrar')
    expect(screen.getByTestId('where').textContent).toBe('/entrar')
  })
})
