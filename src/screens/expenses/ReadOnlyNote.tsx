// Nota bajo un gasto o pago de solo lectura (RF-11): participa alguien que ya no está en el grupo.

import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'

export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <p className="mx-0.5 mt-1 flex items-start gap-1.5 text-[0.8125rem] text-tinta-suave">
      <Lock aria-hidden className="mt-0.5 size-3.5 flex-none" strokeWidth={2.25} />
      <span>{children}</span>
    </p>
  )
}
