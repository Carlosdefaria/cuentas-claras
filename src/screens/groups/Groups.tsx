// Grupos: de momento solo el estado vacío (crear grupos llega en el siguiente paso).

import { Plus } from 'lucide-react'
import { es } from '../../i18n/es'
import { Button } from '../../components/ui'

const T = es.groups

export function Groups() {
  return (
    <>
      <h1 className="font-rotulo text-[2rem] font-bold uppercase leading-none tracking-[0.01em]">{T.title}</h1>
      <section className="mt-6 rounded-xl border-2 border-dashed border-trazo px-5 py-8 text-center">
        <h2 className="text-lg font-semibold">{T.emptyTitle}</h2>
        <p className="mx-auto mt-2 max-w-[32ch] text-tinta-suave">{T.emptyBody}</p>
        <div className="mx-auto mt-6 max-w-xs">
          <Button disabled aria-describedby="crear-grupo-pronto">
            <Plus aria-hidden className="size-5" strokeWidth={2.25} />
            {T.emptyCta}
          </Button>
          <p id="crear-grupo-pronto" className="mt-2 text-sm text-tinta-tenue">
            {T.comingSoon}
          </p>
        </div>
      </section>
    </>
  )
}
