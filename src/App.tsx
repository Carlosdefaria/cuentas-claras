import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { SessionProvider } from './auth/session'
import { GuestOnly, RequireAuth } from './auth/guards'
import { AppShell } from './components/AppShell'
import { AuthForm } from './screens/auth/AuthForm'
import { VerifyEmail } from './screens/auth/VerifyEmail'
import { ForgotPassword } from './screens/auth/ForgotPassword'
import { ResetPassword } from './screens/auth/ResetPassword'
import { Groups } from './screens/groups/Groups'
import { Account } from './screens/account/Account'

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
          { path: '/cuenta', element: <Account /> },
        ],
      },
    ],
  },
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
