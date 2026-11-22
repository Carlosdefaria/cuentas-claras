// /unirse/:code (pública). Sin sesión: crear cuenta o entrar, conservando el destino (?redirectTo) a través de
// registro → verificación por código. Con sesión: el grupo, su número de miembros y «Unirme» (un toque explícito:
// una vista previa del enlace nunca une a nadie). Si ya eres miembro, directo al grupo.
// La Data API exige JWT, así que sin sesión no se puede mostrar el nombre del grupo.

import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { es } from '../../i18n/es'
import { useSession } from '../../auth/session'
import { db } from '../../lib/data'
import { invitePreview, joinGroup, type InvitePreview } from '../../lib/groups'
import { dataErrorMessage, isDataError } from '../../lib/dataErrors'
import { invitePath, isInviteCode } from '../../lib/invite'
import { initialOf, talonFor } from '../../lib/talon'
import { useAsync } from '../../lib/useAsync'
import { currentInstallEnv, iosInstallDevice } from '../../pwa/installHelp'
import { AppFrame } from '../../components/AppShell'
import { SessionChecking, SessionError } from '../../components/SessionStates'
import { Alert, Button, ButtonLink, LoadError, Participacion, SectionTitle, TextLink, TopBar } from '../../components/ui'
import { TALON_BG } from '../../components/talonBg'

const T = es.groups.join

export function JoinGroup() {
  const { code = '' } = useParams()
  const { state, refresh } = useSession()

  if (state.status === 'checking') return <SessionChecking />
  if (state.status === 'error') return <SessionError error={state.error} onRetry={refresh} />
  if (state.status === 'signed-out') return <SignedOutInvite code={code} />
  return (
    <AppFrame back="/">
      {isInviteCode(code) ? <SignedInInvite code={code} /> : <InvalidInvite />}
    </AppFrame>
  )
}

function SignedOutInvite({ code }: { code: string }) {
  const keep = `?redirectTo=${encodeURIComponent(invitePath(code))}`
  // En Safari de iOS: unirse antes de instalar (la app instalada empieza en «/» y no comparte la sesión).
  const [ios] = useState(() => iosInstallDevice(currentInstallEnv()))
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8">
        <Participacion title={T.signedOutTitle} tint="menta">
          <p className="text-tinta-suave">{T.signedOutBody}</p>
          <div className="mt-6 flex flex-col gap-3">
            <ButtonLink to={`/registro${keep}`}>{T.signUp}</ButtonLink>
            <ButtonLink to={`/entrar${keep}`} tone="secundario">
              {T.signIn}
            </ButtonLink>
          </div>
        </Participacion>
        {ios && <p className="mx-auto mt-5 max-w-[36ch] text-center text-sm text-tinta-suave">{T.safariFirst}</p>}
      </main>
    </div>
  )
}

function InvalidInvite() {
  return (
    <>
      <SectionTitle>{T.title}</SectionTitle>
      <section className="mt-5 rounded-xl border-2 border-dashed border-trazo px-5 py-8 text-center">
        <h2 className="text-lg font-semibold">{T.invalidTitle}</h2>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-tinta-suave">{T.invalidBody}</p>
        <div className="mx-auto mt-6 max-w-xs">
          <ButtonLink to="/">{es.groups.detail.toGroups}</ButtonLink>
        </div>
      </section>
    </>
  )
}

function SignedInInvite({ code }: { code: string }) {
  const preview = useAsync(() => invitePreview(db, code), [code])
  if (preview.status === 'loading') return <InviteSkeleton />
  if (preview.status === 'error') {
    if (isDataError(preview.error, 'not-found')) return <InvalidInvite />
    return (
      <>
        <SectionTitle>{T.title}</SectionTitle>
        <LoadError title={T.loadError} message={dataErrorMessage(preview.error)} onRetry={preview.reload} />
      </>
    )
  }
  if (preview.data.isMember) return <Navigate to={`/grupos/${preview.data.groupId}`} replace />
  return <JoinCard code={code} group={preview.data} />
}

function JoinCard({ code, group }: { code: string; group: InvitePreview }) {
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    setJoining(true)
    setError(null)
    try {
      const id = await joinGroup(db, code)
      navigate(`/grupos/${id}?bienvenida=1`, { replace: true })
    } catch (e) {
      setError(isDataError(e, 'not-found') ? T.invalidTitle : dataErrorMessage(e))
      setJoining(false)
    }
  }

  return (
    <>
      <SectionTitle>{T.title}</SectionTitle>
      <section className="mt-5 flex items-center gap-3.5 rounded-xl bg-hoja p-4 shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
        <span
          aria-hidden
          className={`flex size-14 flex-none items-center justify-center rounded-[0.625rem] font-rotulo text-[1.875rem] font-bold ${TALON_BG[talonFor(group.groupId)]}`}
        >
          {initialOf(group.name)}
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold leading-snug">{group.name}</h2>
          <p className="text-tinta-suave">{es.groups.members(group.memberCount)}</p>
        </div>
      </section>
      <p className="mt-4 text-tinta-suave">{T.body}</p>
      <div className="mt-5 flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}
        <Button onClick={() => void join()} loading={joining}>
          {joining ? T.submitting : T.submit}
        </Button>
        <p className="text-center">
          <TextLink to="/">{T.notNow}</TextLink>
        </p>
      </div>
    </>
  )
}

function InviteSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        {T.loading}
      </p>
      <SectionTitle>{T.title}</SectionTitle>
      <div aria-hidden className="mt-5 flex animate-pulse items-center gap-3.5 rounded-xl bg-hoja p-4">
        <div className="size-14 rounded-[0.625rem] bg-papel-hondo" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-2/3 rounded bg-papel-hondo" />
          <div className="h-4 w-1/4 rounded bg-papel" />
        </div>
      </div>
      <div aria-hidden className="mt-9 h-12 animate-pulse rounded-lg bg-loteria-claro" />
    </div>
  )
}
