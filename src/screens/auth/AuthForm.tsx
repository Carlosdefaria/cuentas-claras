// Formulario compartido de entrar / crear cuenta. Validación en cliente antes de llamar a Auth;
// los errores del servidor se traducen con authErrorMessage.

import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useSession } from '../../auth/session'
import { authErrorMessage, isEmailNotVerified } from '../../lib/authErrors'
import { EMAIL_RE } from '../../lib/email'
import { safeRedirect } from '../../lib/safeRedirect'
import { es } from '../../i18n/es'
import { Alert, Button, Field, Participacion, TextLink, TopBar } from '../../components/ui'
import { InstallHelp } from '../../pwa/InstallHelp'

const T = es.auth

type Mode = 'sign-in' | 'sign-up'
type Errors = Partial<Record<'name' | 'email' | 'password', string>>

export function AuthForm({ mode }: { mode: Mode }) {
  const { signIn, signUp } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const location = useLocation()
  const redirectTo = params.get('redirectTo')
  const keep = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''
  const initialEmail = (location.state as { email?: string } | null)?.email
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const isSignUp = mode === 'sign-up'
  const copy = isSignUp ? T.signUp : T.signIn
  const otherHref = `${isSignUp ? '/entrar' : '/registro'}${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')

    const next: Errors = {}
    if (isSignUp && !name) next.name = T.validation.nameRequired
    if (!email) next.email = T.validation.emailRequired
    else if (!EMAIL_RE.test(email)) next.email = T.validation.emailInvalid
    if (!password) next.password = T.validation.passwordRequired
    else if (isSignUp && password.length < 8) next.password = T.validation.passwordTooShort
    setErrors(next)
    setServerError(null)
    const first = next.name ? nameRef : next.email ? emailRef : next.password ? passwordRef : null
    if (first) {
      first.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      if (isSignUp && (await signUp(name, email, password)) === 'verify') {
        navigate(`/verificar${keep}`, { state: { email } })
        return
      }
      if (!isSignUp) await signIn(email, password)
      navigate(safeRedirect(redirectTo), { replace: true })
    } catch (error) {
      // Cuenta sin confirmar: el servidor acaba de enviar un código nuevo.
      if (isEmailNotVerified(error)) {
        navigate(`/verificar${keep}`, { state: { email } })
        return
      }
      setServerError(authErrorMessage(error))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back={isSignUp ? `/entrar${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}` : undefined} />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8">
        {redirectTo && !isSignUp && <p className="mb-4 text-center text-tinta-suave">{T.signIn.redirected}</p>}
        <InstallHelp context="acceso" className="mb-6" />
        <Participacion title={copy.title} tint={isSignUp ? 'cielo' : 'salmon'}>
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
            {serverError && <Alert>{serverError}</Alert>}
            {isSignUp && (
              <Field
                ref={nameRef}
                name="name"
                label={T.fields.name}
                hint={T.fields.nameHint}
                error={errors.name}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                maxLength={60}
              />
            )}
            <Field
              ref={emailRef}
              name="email"
              type="email"
              label={T.fields.email}
              error={errors.email}
              defaultValue={initialEmail}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              enterKeyHint="next"
            />
            <Field
              ref={passwordRef}
              name="password"
              type="password"
              label={T.fields.password}
              hint={isSignUp ? T.fields.passwordHint : undefined}
              error={errors.password}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              enterKeyHint="go"
            />
            {!isSignUp && (
              <Link
                to={`/recuperar${keep}`}
                onClick={(event) => {
                  // Lleva el email ya escrito para no teclearlo dos veces.
                  event.preventDefault()
                  navigate(`/recuperar${keep}`, { state: { email: emailRef.current?.value.trim() || undefined } })
                }}
                className="-mt-3 inline-flex min-h-11 items-center self-start font-semibold text-loteria underline hover:text-loteria-hondo"
              >
                {T.forgot.link}
              </Link>
            )}
            <Button type="submit" loading={submitting} className="mt-1">
              {submitting ? copy.submitting : copy.submit}
            </Button>
          </form>
        </Participacion>
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 text-tinta-suave">
          {isSignUp ? T.signUp.hasAccount : T.signIn.noAccount}
          <TextLink to={otherHref}>{isSignUp ? T.signUp.toSignIn : T.signIn.toSignUp}</TextLink>
        </p>
      </main>
    </div>
  )
}
