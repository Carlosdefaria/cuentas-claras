// Crear grupo: nombre (1–100 caracteres) y moneda fija en euros (MVP). Al crearlo, al detalle con «Invitar» abierto.

import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { es } from '../../i18n/es'
import { db } from '../../lib/data'
import { createGroup, GROUP_NAME_MAX, validateGroupName } from '../../lib/groups'
import { dataErrorMessage } from '../../lib/dataErrors'
import { Alert, Button, Field, Participacion } from '../../components/ui'

const T = es.groups.create

export function NewGroup() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const name = String(new FormData(event.currentTarget).get('name') ?? '')
    const invalid = validateGroupName(name)
    setServerError(null)
    if (invalid) {
      setError(invalid === 'required' ? T.nameRequired : T.nameTooLong)
      nameRef.current?.focus()
      return
    }
    setError(undefined)
    setSubmitting(true)
    try {
      const id = await createGroup(db, name)
      navigate(`/grupos/${id}?invitar=1`, { replace: true })
    } catch (e) {
      setServerError(dataErrorMessage(e))
      setSubmitting(false)
    }
  }

  return (
    <Participacion title={T.title} tint="mantequilla">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {serverError && <Alert>{serverError}</Alert>}
        <Field
          ref={nameRef}
          name="name"
          label={T.name}
          hint={T.nameHint}
          error={error}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          maxLength={GROUP_NAME_MAX}
        />
        <div>
          <p className="text-[0.9375rem] font-semibold">{T.currencyLabel}</p>
          <p className="mt-1.5 flex h-12 items-center rounded-lg bg-papel px-3.5 text-tinta">{es.groups.currency}</p>
          <p className="mt-1.5 text-sm text-tinta-suave">{T.currencyHint}</p>
        </div>
        <Button type="submit" loading={submitting} className="mt-1">
          {submitting ? T.submitting : T.submit}
        </Button>
      </form>
    </Participacion>
  )
}
