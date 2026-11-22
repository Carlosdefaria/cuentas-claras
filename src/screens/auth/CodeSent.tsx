// Piezas comunes de las pantallas con código: a quién se ha enviado y «Reenviar código» / «Cambiar email».

import { useState, type ReactNode } from 'react'
import { authErrorMessage } from '../../lib/authErrors'
import { sendCode, type OtpType } from '../../lib/otp'
import { useCooldown } from '../../lib/useCooldown'
import { es } from '../../i18n/es'
import { TextLink } from '../../components/ui'

const T = es.auth.code
export const RESEND_SECONDS = 60

/** «Te lo hemos enviado a <email>.» (o el texto que no revela si la cuenta existe). */
export function SentTo({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.9375rem] text-tinta-suave">
      {children} {T.sentHint}
    </p>
  )
}

export function Email({ value }: { value: string }) {
  return <strong className="font-semibold break-all text-tinta">{value}</strong>
}

/** Reenviar (con cuenta atrás) y cambiar de email, bajo la participación. */
export function CodeActions({
  email,
  type,
  changeEmailTo,
  onResent,
  onError,
}: {
  email: string
  type: OtpType
  changeEmailTo: string
  onResent: () => void
  onError: (message: string) => void
}) {
  const { left, restart } = useCooldown(RESEND_SECONDS)
  const [sending, setSending] = useState(false)
  const waiting = left > 0 || sending
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4">
      <button
        type="button"
        disabled={waiting}
        onClick={async () => {
          setSending(true)
          try {
            await sendCode(email, type)
            restart()
            onResent()
          } catch (error) {
            onError(authErrorMessage(error))
          } finally {
            setSending(false)
          }
        }}
        className="inline-flex min-h-11 items-center font-semibold text-loteria underline transition-colors duration-150 hover:text-loteria-hondo disabled:cursor-default disabled:font-medium disabled:text-tinta-tenue disabled:no-underline"
      >
        {left > 0 ? T.resendIn(left) : T.resend}
      </button>
      <TextLink to={changeEmailTo}>{T.changeEmail}</TextLink>
    </div>
  )
}

/** Aviso discreto tras reenviar el código. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg bg-loteria-claro px-3.5 py-3 text-[0.9375rem] font-medium text-loteria-hondo">
      {children}
    </p>
  )
}
