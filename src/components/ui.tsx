// Piezas de interfaz compartidas. Controles estándar (inputs, botones, enlaces) vestidos con el
// mundo de las participaciones solo en tipo, color y el troquel.

import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { es } from '../i18n/es'
import { PwaBanners } from '../pwa/PwaBanners'
import { TALON_BG } from './talonBg'

/** Barra superior verde con el nombre de la app; respeta el notch (safe-area). */
export function TopBar({ back, children }: { back?: string; children?: ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-[calc(env(safe-area-inset-top)+0.5rem)] focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-hoja focus:px-4 focus:font-semibold focus:text-loteria focus:shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]"
      >
        {es.common.skipToContent}
      </a>
      <header className="bg-loteria text-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-md items-center gap-1 px-2">
          {back ? <BackButton to={back} /> : <span className="w-2" aria-hidden />}
          <p translate="no" className="font-rotulo text-[1.375rem] font-bold uppercase leading-none tracking-[0.04em]">
            {es.appName}
          </p>
          <div className="ml-auto">{children}</div>
        </div>
      </header>
      <PwaBanners />
    </>
  )
}

/** Botón de volver siempre visible (en la PWA de iOS no hay gesto de volver). */
export function BackButton({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(to, { replace: true }))}
      className="-ml-1 inline-flex h-11 min-w-11 items-center rounded-lg pr-2 text-white/95 transition-colors duration-150 hover:bg-white/10 active:bg-white/15"
    >
      <ChevronLeft aria-hidden className="size-6" strokeWidth={2.25} />
      <span className="text-[0.9375rem] font-medium">{es.common.back}</span>
    </button>
  )
}

/**
 * Participación: talón superior (título) y cuerpo separados por la línea troquelada.
 * `tint` es el papel del talón.
 */
export function Participacion({
  title,
  tint = 'salmon',
  level = 1,
  compact = false,
  className = '',
  children,
}: {
  title: ReactNode
  tint?: 'salmon' | 'menta' | 'cielo' | 'mantequilla' | 'lila'
  /** Nivel del título (h1 en las pantallas de tarea; h2 dentro de una hoja). */
  level?: 1 | 2
  /** Versión compacta (hojas inferiores). */
  compact?: boolean
  className?: string
  children: ReactNode
}) {
  const talon = TALON_BG[tint]
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <section className={`rounded-xl bg-hoja ${compact ? 'border border-papel-hondo' : 'shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]'} ${className}`}>
      <div className={`${talon} rounded-t-xl ${compact ? 'px-4 pb-2 pt-4' : 'px-5 pb-3 pt-5'}`}>
        <Heading
          className={`break-words font-rotulo font-bold uppercase leading-[1.05] tracking-[0.01em] text-tinta ${compact ? 'text-[1.5rem]' : 'text-[1.875rem]'}`}
        >
          {title}
        </Heading>
      </div>
      <div className={`troquel ${talon}`} style={{ backgroundImage: 'linear-gradient(to bottom, transparent 50%, var(--color-hoja) 50%)' }} aria-hidden />
      <div className={`rounded-b-xl ${compact ? 'px-4 pb-4 pt-1' : 'px-5 pb-6 pt-3'}`}>{children}</div>
    </section>
  )
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  hint?: string
  error?: string
}

/** Campo con etiqueta visible, ayuda y error accesibles. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, type, ...input }, ref) {
  const id = useId()
  const [reveal, setReveal] = useState(false)
  const isPassword = type === 'password'
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold text-tinta">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-lg border bg-white px-3.5 text-tinta placeholder:text-tinta-tenue transition-[border-color,box-shadow] duration-150 focus:outline-none focus-visible:outline-none ${
            error
              ? 'border-sello focus:border-sello focus:shadow-[0_0_0_3px_rgb(179_48_42/0.18)]'
              : 'border-trazo focus:border-loteria focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)]'
          } ${isPassword ? 'pr-12' : ''}`}
          {...input}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? es.auth.fields.hidePassword : es.auth.fields.showPassword}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-lg text-tinta-suave hover:text-tinta"
          >
            {reveal ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-tinta-suave">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-sello">
          {error}
        </p>
      )}
    </div>
  )
})

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; tone?: 'primario' | 'peligro' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { loading, tone = 'primario', children, disabled, className = '', ...rest },
  ref,
) {
  const tones = {
    primario: 'bg-loteria text-white hover:bg-loteria-hondo active:bg-loteria-hondo',
    peligro: 'border border-sello/40 bg-white text-sello hover:bg-sello-claro active:bg-sello-claro',
  }[tone]
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${tones} ${className}`}
    >
      {loading && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
      {children}
    </button>
  )
})

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-sello/30 bg-sello-claro px-3.5 py-3 text-[0.9375rem] font-medium text-sello">
      {children}
    </div>
  )
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center font-semibold text-loteria underline hover:text-loteria-hondo">
      {children}
    </Link>
  )
}

/** Título de sección en condensada (Grupos, Cuenta, Invitación). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-rotulo text-[2rem] font-bold uppercase leading-none tracking-[0.01em]">{children}</h1>
}

/** Error de carga con Reintentar (nunca datos de caché). */
export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <section role="alert" className="mt-6 rounded-xl bg-hoja px-5 py-6 text-center shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-[34ch] text-tinta-suave">{message}</p>
      <div className="mx-auto mt-5 max-w-xs">
        <Button onClick={onRetry}>{es.common.retry}</Button>
      </div>
    </section>
  )
}

/** Enlace con aspecto de botón (navegación, no acción). */
export function ButtonLink({ to, tone = 'primario', children, className = '' }: { to: string; tone?: 'primario' | 'secundario'; children: ReactNode; className?: string }) {
  const tones = {
    primario: 'bg-loteria text-white hover:bg-loteria-hondo active:bg-loteria-hondo',
    secundario: 'border border-trazo bg-white text-loteria hover:bg-papel active:bg-papel-hondo',
  }[tone]
  return (
    <Link to={to} className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold transition-colors duration-150 ${tones} ${className}`}>
      {children}
    </Link>
  )
}
