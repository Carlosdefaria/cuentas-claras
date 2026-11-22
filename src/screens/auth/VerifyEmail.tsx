// Confirmar el email con el código (tras crear cuenta, o al entrar con una cuenta sin confirmar).
// Al acertar, el servidor abre la sesión y GuestOnly lleva al destino.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { useSession } from '../../auth/session'
import { authErrorMessage, needsNewCode } from '../../lib/authErrors'
import { isCompleteCode } from '../../lib/code'
import { es } from '../../i18n/es'
import { Alert, Button, Participacion, TopBar } from '../../components/ui'
import { CodeField } from '../../components/CodeField'
import { CodeActions, Email, Notice, SentTo } from './CodeSent'

const T = es.auth

export function VerifyEmail() {
  const { verifyEmail } = useSession()
  const location = useLocation()
  const [params] = useSearchParams()
  const email = (location.state as { email?: string } | null)?.email
  const redirectTo = params.get('redirectTo')
  const keep = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''

  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => codeRef.current?.focus(), [])

  // Sin email (recarga sin estado o enlace directo): se empieza por entrar.
  if (!email) return <Navigate to={`/entrar${keep}`} replace />

  async function submit(value: string) {
    if (submitting) return
    setServerError(null)
    setNotice(null)
    if (!isCompleteCode(value)) {
      setFieldError(T.code.invalidLength)
      codeRef.current?.focus()
      return
    }
    setFieldError(undefined)
    setSubmitting(true)
    try {
      await verifyEmail(email!, value) // con sesión, GuestOnly redirige al destino
    } catch (error) {
      const message = authErrorMessage(error)
      if (needsNewCode(error)) setServerError(message)
      else setFieldError(message)
      setCode('')
      setSubmitting(false)
      codeRef.current?.focus()
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back={`/registro${keep}`} />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8">
        <Participacion title={T.verify.title} tint="menta">
          <form
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              void submit(code)
            }}
            className="flex flex-col gap-5"
          >
            <SentTo>
              {T.code.sentTo} <Email value={email} />.
            </SentTo>
            {serverError && <Alert>{serverError}</Alert>}
            {notice && <Notice>{notice}</Notice>}
            <CodeField ref={codeRef} value={code} onChange={setCode} onComplete={(c) => void submit(c)} error={fieldError} disabled={submitting} />
            <Button type="submit" loading={submitting}>
              {submitting ? T.verify.submitting : T.verify.submit}
            </Button>
          </form>
        </Participacion>
        <CodeActions
          email={email}
          type="email-verification"
          changeEmailTo={`/registro${keep}`}
          onResent={() => {
            setServerError(null)
            setNotice(T.code.resent)
          }}
          onError={setServerError}
        />
        {/* Registrarse con un email que ya tiene cuenta no da error (no se revela qué emails existen): aquí se ofrece entrar. */}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-tinta-suave">
          {T.verify.hadAccount}
          <Link
            to={`/entrar${keep}`}
            state={{ email }}
            className="inline-flex min-h-11 items-center font-semibold text-loteria underline hover:text-loteria-hondo"
          >
            {T.verify.toSignIn}
          </Link>
        </p>
      </main>
    </div>
  )
}
