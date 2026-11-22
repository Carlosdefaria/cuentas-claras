// Campo del código de 6 cifras. Un único <input> (no seis casillas): así funcionan pegar y la sugerencia
// de iOS encima del teclado (autocomplete="one-time-code"). Al completar las 6 cifras avisa con onComplete.

import { forwardRef, useId } from 'react'
import { CODE_LENGTH, normalizeCode } from '../lib/code'
import { es } from '../i18n/es'

type Props = {
  value: string
  onChange: (code: string) => void
  onComplete?: (code: string) => void
  error?: string
  disabled?: boolean
}

export const CodeField = forwardRef<HTMLInputElement, Props>(function CodeField(
  { value, onChange, onComplete, error, disabled },
  ref,
) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold text-tinta">
        {es.auth.code.label}
      </label>
      <input
        ref={ref}
        id={id}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        enterKeyHint="go"
        spellCheck={false}
        autoCorrect="off"
        maxLength={CODE_LENGTH + 6} // deja pegar «123 456»; normalizeCode lo limpia
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const code = normalizeCode(event.target.value)
          onChange(code)
          if (code.length === CODE_LENGTH && code !== value) onComplete?.(code)
        }}
        className={`h-15 w-full rounded-lg border bg-white pl-[calc(0.875rem+0.35em)] pr-3.5 text-center text-[1.875rem] font-medium tracking-[0.35em] text-tinta tabular-nums transition-[border-color,box-shadow] duration-150 placeholder:text-trazo focus:border-loteria focus:shadow-[0_0_0_3px_rgb(13_86_55/0.18)] focus:outline-none focus-visible:outline-none disabled:opacity-60 ${
          error ? 'border-sello' : 'border-trazo'
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-sello">
          {error}
        </p>
      )}
    </div>
  )
})
