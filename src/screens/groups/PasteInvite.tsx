// «Unirme con un enlace»: pegar el enlace (o el código) recibido. Red de seguridad para la app instalada en iOS,
// que empieza en «/» aunque el enlace se abriera en Safari.

import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { es } from '../../i18n/es'
import { invitePath, parseInviteCode } from '../../lib/invite'
import { Button, Field, Participacion } from '../../components/ui'

const T = es.groups.join

export function PasteInvite() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const ref = useRef<HTMLInputElement>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = parseInviteCode(String(new FormData(event.currentTarget).get('invite') ?? ''))
    if (!code) {
      setError(T.pasteInvalid)
      ref.current?.focus()
      return
    }
    navigate(invitePath(code))
  }

  return (
    <Participacion title={T.pasteTitle} tint="menta">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          ref={ref}
          name="invite"
          label={T.pasteLabel}
          hint={T.pasteHint}
          error={error}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          enterKeyHint="go"
        />
        <Button type="submit">{T.pasteSubmit}</Button>
      </form>
    </Participacion>
  )
}
