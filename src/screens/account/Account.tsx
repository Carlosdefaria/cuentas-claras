// Cuenta: quién ha entrado y cerrar sesión.

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '../../auth/session'
import { authErrorMessage } from '../../lib/authErrors'
import { es } from '../../i18n/es'
import { Alert, Button } from '../../components/ui'

const T = es.account

export function Account() {
  const { state, signOut } = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (state.status !== 'signed-in') return null
  const { user } = state

  return (
    <>
      <h1 className="font-rotulo text-[2rem] font-bold uppercase leading-none tracking-[0.01em]">{T.title}</h1>
      <section className="mt-6 rounded-xl bg-hoja px-5 py-5 shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
        <p className="text-sm text-tinta-suave">{T.signedInAs}</p>
        <p className="mt-1 text-lg font-semibold break-words">{user.name}</p>
        <p className="text-tinta-suave break-all">{user.email}</p>
      </section>
      <div className="mt-6 flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}
        <Button
          tone="peligro"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await signOut() // RequireAuth lleva a /entrar sin destino
              navigate('/entrar', { replace: true })
            } catch (e) {
              setError(authErrorMessage(e))
              setBusy(false)
            }
          }}
        >
          {busy ? T.signingOut : T.signOut}
        </Button>
      </div>
    </>
  )
}
