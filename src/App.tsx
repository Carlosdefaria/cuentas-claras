import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { SessionProvider } from './auth/session'
import { GuestOnly, RequireAuth } from './auth/guards'
import { AppShell } from './components/AppShell'
import { AuthForm } from './screens/auth/AuthForm'
import { VerifyEmail } from './screens/auth/VerifyEmail'
import { ForgotPassword } from './screens/auth/ForgotPassword'
import { ResetPassword } from './screens/auth/ResetPassword'
import { Groups } from './screens/groups/Groups'
import { NewGroup } from './screens/groups/NewGroup'
import { GroupDetail } from './screens/groups/GroupDetail'
import { JoinGroup } from './screens/groups/JoinGroup'
import { PasteInvite } from './screens/groups/PasteInvite'
import { AddExpense, EditExpense } from './screens/expenses/AddExpense'
import { ExpenseDetail } from './screens/expenses/ExpenseDetail'
import { Account } from './screens/account/Account'

// «Volver» desde las pantallas de un gasto: al grupo.
const toGroup = (params: Record<string, string | undefined>) => `/grupos/${params.id ?? ''}`
// «Volver» desde editar: al gasto.
const toExpense = (params: Record<string, string | undefined>) => `/grupos/${params.id ?? ''}/gastos/${params.expenseId ?? ''}`

const routes = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/entrar', element: <AuthForm mode="sign-in" /> },
      { path: '/registro', element: <AuthForm mode="sign-up" /> },
      { path: '/verificar', element: <VerifyEmail /> },
      { path: '/recuperar', element: <ForgotPassword /> },
      { path: '/recuperar/codigo', element: <ResetPassword /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Groups /> },
          { path: '/grupos/nuevo', element: <NewGroup />, handle: { back: '/' } },
          { path: '/grupos/:id', element: <GroupDetail />, handle: { back: '/' } },
          { path: '/grupos/:id/gastos/nuevo', element: <AddExpense />, handle: { back: toGroup } },
          { path: '/grupos/:id/gastos/:expenseId', element: <ExpenseDetail />, handle: { back: toGroup } },
          { path: '/grupos/:id/gastos/:expenseId/editar', element: <EditExpense />, handle: { back: toExpense } },
          { path: '/unirse', element: <PasteInvite />, handle: { back: '/' } },
          { path: '/cuenta', element: <Account /> },
        ],
      },
    ],
  },
  // Invitación: pública (sin sesión lleva a registrarse o entrar y vuelve aquí).
  { path: '/unirse/:code', element: <JoinGroup /> },
  { path: '*', element: <Navigate to="/" replace /> },
]

const router = createBrowserRouter(routes)

export default function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
