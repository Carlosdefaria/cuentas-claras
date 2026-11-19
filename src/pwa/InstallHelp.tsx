// Ayuda de instalación para iOS (no hay `beforeinstallprompt`): Compartir → Añadir a pantalla de inicio.
// En Entrar/Registro se puede descartar; en Cuenta queda siempre disponible mientras no esté instalada.

import { useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { es } from '../i18n/es'
import { currentInstallEnv, iosInstallDevice } from './installHelp'

const T = es.pwa.install
const DISMISS_KEY = 'cuentas-claras:ayuda-instalar-descartada'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function InstallHelp({ context, className = '' }: { context: 'acceso' | 'cuenta'; className?: string }) {
  const [device] = useState(() => iosInstallDevice(currentInstallEnv()))
  const [dismissed, setDismissed] = useState(() => context === 'acceso' && readDismissed())
  if (!device || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Sin almacenamiento (navegación privada): se oculta solo en esta visita.
    }
  }

  if (context === 'acceso') {
    // Versión compacta: no debe empujar el formulario de entrar fuera de la pantalla.
    return (
      <section
        aria-labelledby="ayuda-instalar"
        className={`relative rounded-xl bg-hoja px-4 py-3.5 shadow-[0_1px_2px_rgb(19_38_29/0.08)] ${className}`}
      >
        <h2 id="ayuda-instalar" className="pr-10 text-base font-semibold leading-snug text-tinta">
          {T.titleShort(device)}
        </h2>
        <p className="mt-0.5 pr-6 text-[0.9375rem] leading-snug text-tinta-suave">{T.bodyAccess}</p>
        <ol className="mt-2.5 flex flex-col gap-1.5 text-[0.9375rem] leading-snug text-tinta">
          <Step n={1} icon={<Share aria-hidden className="size-[1.125rem]" strokeWidth={2} />}>
            {T.step1} <span className="text-tinta-suave">{T.step1Hint}</span>
          </Step>
          <Step n={2} icon={<SquarePlus aria-hidden className="size-[1.125rem]" strokeWidth={2} />}>
            {T.step2}
          </Step>
        </ol>
        <button
          type="button"
          onClick={dismiss}
          aria-label={T.dismiss}
          className="absolute right-0.5 top-0.5 inline-flex size-11 items-center justify-center rounded-lg text-tinta-suave transition-colors duration-150 hover:bg-papel hover:text-tinta"
        >
          <X aria-hidden className="size-5" strokeWidth={2} />
        </button>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="ayuda-instalar"
      className={`rounded-xl bg-hoja px-5 pb-5 pt-4 shadow-[0_1px_2px_rgb(19_38_29/0.08)] ${className}`}
    >
      <h2 id="ayuda-instalar" className="text-lg font-semibold leading-snug text-tinta">
        {T.title(device)}
      </h2>
      <p className="mt-1 text-[0.9375rem] text-tinta-suave">{T.bodyAccount}</p>
      <ol className="mt-3 flex flex-col gap-2.5 text-[0.9375rem] text-tinta">
        <Step n={1} icon={<Share aria-hidden className="size-[1.125rem]" strokeWidth={2} />}>
          {T.step1} <span className="text-tinta-suave">{T.step1Hint}</span>
        </Step>
        <Step n={2} icon={<SquarePlus aria-hidden className="size-[1.125rem]" strokeWidth={2} />}>
          {T.step2}
        </Step>
        <Step n={3}>{T.step3Account}</Step>
      </ol>
    </section>
  )
}

function Step({ n, icon, children }: { n: number; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-loteria-claro text-sm font-semibold text-loteria"
      >
        {n}
      </span>
      <span className="flex-1">
        {icon && <span className="mr-1.5 inline-flex translate-y-[3px] text-loteria">{icon}</span>}
        {children}
      </span>
    </li>
  )
}
