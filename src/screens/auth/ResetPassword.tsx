// Recuperar la contraseña en dos pasos (variante C): 1) el código, que se comprueba al momento sin gastarlo;
// 2) la contraseña nueva. Al terminar se entra directamente, sin salir de la app.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { CircleCheck } from 'lucide-react'
import { useSession } from '../../auth/session'
import { authErrorMessage, needsNewCode } from '../../lib/authErrors'
import { isCompleteCode } from '../../lib/code'
import { checkResetCode, resetPassword } from '../../lib/otp'
import { safeRedirect } from '../../lib/safeRedirect'
import { es } from '../../i18n/es'
import { Alert, Button, Field, Participacion, TopBar } from '../../components/ui'
import { CodeField } from '../../components/CodeField'
import { CodeActions, Email, Notice, SentTo } from './CodeSent'

const T = es.auth

export function ResetPassword() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const email = (location.state as { email?: string } | null)?.email
  const redirectTo = params.get('redirectTo')
  const keep = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''

  const [step, setStep] = useState<1 | 2>(1)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string>()
  const [passwordError, setPasswordError] = useState<string>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 1) codeRef.current?.focus()
    else passwordRef.current?.focus()
  }, [step])

  if (!email) return <Navigate to={`/recuperar${keep}`} replace />

  /** Vuelve al paso 1 con el error del código (caducado, agotado o incorrecto). */
  function codeFailed(error: unknown) {
    const message = authErrorMessage(error)
    setStep(1)
    setCode('')
    if (needsNewCode(error)) {
      setServerError(message)
      setCodeError(undefined)
    } else setCodeError(message)
  }

  async function checkCode(value: string) {
    if (submitting) return
    setServerError(null)
    setNotice(null)
    if (!isCompleteCode(value)) {
      setCodeError(T.code.invalidLength)
      codeRef.current?.focus()
      return
    }
    setCodeError(undefined)
    setSubmitting(true)
    try {
      await checkResetCode(email!, value)
      setStep(2)
    } catch (error) {
      codeFailed(error)
      codeRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    setServerError(null)
    const invalid = !password ? T.validation.passwordRequired : password.length < 8 ? T.validation.passwordTooShort : undefined
    setPasswordError(invalid)
    if (invalid) {
      passwordRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      await resetPassword(email!, code, password)
    } catch (error) {
      setSubmitting(false)
      const message = authErrorMessage(error)
      // Un código que ha dejado de valer en el rato del paso 2 lleva de vuelta al paso 1.
      if (message === T.errors.invalidCode || needsNewCode(error)) codeFailed(error)
      else setServerError(message)
      return
    }
    try {
      await signIn(email!, password)
      navigate(safeRedirect(redirectTo), { replace: true })
    } catch {
      // La contraseña ya está cambiada: si entrar falla (p. ej. sin red), se entra a mano.
      navigate(`/entrar${keep}`, { replace: true, state: { email } })
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back={`/recuperar${keep}`} />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8">
        {step === 1 ? (
          <>
            <Participacion title={T.reset.codeTitle} tint="menta">
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  void checkCode(code)
                }}
                className="flex flex-col gap-5"
              >
                <p className="text-sm font-semibold text-tinta-suave">{T.code.step(1)}</p>
                <SentTo>
                  {T.reset.sentGeneric} <Email value={email} />, {T.reset.sentGenericEnd}
                </SentTo>
                {serverError && <Alert>{serverError}</Alert>}
                {notice && <Notice>{notice}</Notice>}
                <CodeField ref={codeRef} value={code} onChange={setCode} onComplete={(c) => void checkCode(c)} error={codeError} disabled={submitting} />
                <Button type="submit" loading={submitting}>
                  {submitting ? T.reset.checking : T.reset.continue}
                </Button>
              </form>
            </Participacion>
            <CodeActions
              email={email}
              type="forget-password"
              changeEmailTo={`/recuperar${keep}`}
              onResent={() => {
                setServerError(null)
                setCodeError(undefined)
                setNotice(T.code.resent)
              }}
              onError={setServerError}
            />
          </>
        ) : (
          <Participacion title={T.reset.passwordTitle} tint="menta">
            <form noValidate onSubmit={onPassword} className="flex flex-col gap-5">
              <p className="text-sm font-semibold text-tinta-suave">{T.code.step(2)}</p>
              <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-favor">
                <CircleCheck aria-hidden className="size-5" strokeWidth={2} />
                {T.code.correct}
              </p>
              {serverError && <Alert>{serverError}</Alert>}
              {/* Para que el gestor de contraseñas de iOS guarde la nueva con su cuenta. */}
              <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
              <Field
                ref={passwordRef}
                name="password"
                type="password"
                label={T.reset.newPassword}
                hint={T.fields.passwordHint}
                error={passwordError}
                autoComplete="new-password"
                enterKeyHint="go"
              />
              <Button type="submit" loading={submitting}>
                {submitting ? T.reset.submitting : T.reset.submit}
              </Button>
            </form>
          </Participacion>
        )}
      </main>
    </div>
  )
}
