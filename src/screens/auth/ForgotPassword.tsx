// Recuperar la contraseña, paso previo: el email al que enviar el código.

import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { authErrorMessage } from '../../lib/authErrors'
import { sendCode } from '../../lib/otp'
import { EMAIL_RE } from '../../lib/email'
import { es } from '../../i18n/es'
import { Alert, Button, Field, Participacion, TextLink, TopBar } from '../../components/ui'

const T = es.auth

export function ForgotPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const redirectTo = params.get('redirectTo')
  const keep = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''
  const initialEmail = (location.state as { email?: string } | null)?.email ?? ''

  const [error, setError] = useState<string>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    setServerError(null)
    const invalid = !email ? T.validation.emailRequired : !EMAIL_RE.test(email) ? T.validation.emailInvalid : undefined
    setError(invalid)
    if (invalid) {
      emailRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      await sendCode(email, 'forget-password')
      navigate(`/recuperar/codigo${keep}`, { state: { email } })
    } catch (e) {
      setServerError(authErrorMessage(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back={`/entrar${keep}`} />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8">
        <Participacion title={T.forgot.title} tint="mantequilla">
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
            <p className="text-[0.9375rem] text-tinta-suave">{T.forgot.body}</p>
            {serverError && <Alert>{serverError}</Alert>}
            <Field
              ref={emailRef}
              name="email"
              type="email"
              label={T.fields.email}
              error={error}
              defaultValue={initialEmail}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              enterKeyHint="send"
            />
            <Button type="submit" loading={submitting}>
              {submitting ? T.forgot.submitting : T.forgot.submit}
            </Button>
          </form>
        </Participacion>
        <p className="mt-6 flex justify-center">
          <TextLink to={`/entrar${keep}`}>{T.forgot.backToSignIn}</TextLink>
        </p>
      </main>
    </div>
  )
}
