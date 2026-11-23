// Pestaña Saldos: «Tu saldo» en una participación (cifra grande y desglose), «Para saldar cuentas» con los pagos mínimos
// (simplifyDebts; los tuyos con «Registrar», en una hoja inferior) y el resto del grupo debajo (variante A).
// Saldos siempre de computeBalances; positivo = le deben. Rojo sello solo para «debe».

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { es } from '../../i18n/es'
import { formatCents } from '../../domain/money'
import { balanceKind } from '../../domain/balanceText'
import type { Settlement } from '../../domain/balances'
import { simplifyDebts } from '../../domain/simplify'
import type { ExpenseRow } from '../../lib/expenses'
import type { Person } from '../../lib/people'
import { Participacion } from '../../components/ui'
import { PersonDot } from './PersonDot'
import { SettlementSheet, type SuggestedPayment } from './SettlementSheet'

const T = es.expenses.balances
const TONE = { owed: 'text-favor', owes: 'text-sello', settled: 'text-tinta-suave' } as const

export function BalancesPanel({
  groupId,
  balances,
  people,
  me,
  expenses,
  settlements,
  onSettled,
}: {
  groupId: string
  balances: Map<string, number>
  people: Map<string, Person>
  me: string | null
  expenses: ExpenseRow[]
  settlements: Settlement[]
  /** Tras registrar un pago (la pantalla recarga los datos y avisa). */
  onSettled: (payment: SuggestedPayment, amountCents: number) => void
}) {
  const [registering, setRegistering] = useState<SuggestedPayment | null>(null)
  const suggested = simplifyDebts(balances).flatMap((p) => {
    const from = people.get(p.fromUser)
    const to = people.get(p.toUser)
    return from && to ? [{ from, to, amountCents: p.amountCents }] : []
  })
  const mine = me ? (balances.get(me) ?? 0) : 0
  const kind = balanceKind(mine)
  const paid = expenses.filter((e) => e.paidBy === me).reduce((a, e) => a + e.amountCents, 0)
  const share = expenses.reduce((a, e) => a + (e.shares.find((s) => s.userId === me)?.amountCents ?? 0), 0)
  // Desglose que cuadra con la cifra: gastos (pagado − cuota) + pagos hechos − pagos recibidos.
  const sent = settlements.filter((s) => s.fromUser === me).reduce((a, s) => a + s.amountCents, 0)
  const received = settlements.filter((s) => s.toUser === me).reduce((a, s) => a + s.amountCents, 0)
  const others = [...balances.entries()].filter(([id]) => id !== me).sort((a, b) => b[1] - a[1])

  return (
    <>
      <Participacion title={T.yours} tint="menta" level={2} compact className="shadow-[0_1px_2px_rgb(19_38_29/0.08),0_8px_24px_-12px_rgb(19_38_29/0.25)]">
        <p className={`text-[1.875rem] font-bold leading-tight tabular-nums ${TONE[kind]}`}>
          {kind === 'owed' ? T.youAreOwed(formatCents(mine)) : kind === 'owes' ? T.youOwe(formatCents(-mine)) : T.youSettled}
        </p>
        <p className="mt-1 text-tinta-suave tabular-nums">
          {T.breakdown(formatCents(paid), formatCents(share))}
          {sent > 0 && ` ${T.sentPayments(formatCents(sent))}`}
          {received > 0 && ` ${T.receivedPayments(formatCents(received))}`}
        </p>
      </Participacion>

      {suggested.length > 0 && (
        <>
          <h2 className="mx-0.5 mb-2 mt-5 text-sm font-semibold text-tinta-suave">{T.toSettle(suggested.length)}</h2>
          <ul className="divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
            {suggested.map((p) => {
              const what = p.from.isMe ? T.youPay(p.to.name) : p.to.isMe ? T.paysYou(p.from.name) : T.pays(p.from.name, p.to.name)
              const mine = p.from.isMe || p.to.isMe
              return (
                <li key={`${p.from.id}-${p.to.id}`} className="flex min-h-15 items-center gap-2 px-3.5 py-2.5">
                  <PersonDot person={p.from} />
                  <ArrowRight aria-hidden className="size-4 flex-none text-tinta-tenue" strokeWidth={2.25} />
                  <PersonDot person={p.to} />
                  <span className="min-w-0 flex-1 pl-1">
                    <span className="block break-words font-semibold leading-snug">{what}</span>
                    <span className="block font-bold tabular-nums">{formatCents(p.amountCents)}</span>
                  </span>
                  {mine && (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={T.registerLabel(what, formatCents(p.amountCents))}
                      onClick={() => setRegistering(p)}
                      className="inline-flex h-11 flex-none items-center rounded-lg bg-loteria px-3.5 text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-loteria-hondo active:bg-loteria-hondo"
                    >
                      {T.register}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <h2 className="mx-0.5 mb-2 mt-5 text-sm font-semibold text-tinta-suave">{T.wholeGroup}</h2>
          <ul className="divide-y divide-papel-hondo rounded-xl bg-hoja shadow-[0_1px_2px_rgb(19_38_29/0.08)]">
            {others.map(([id, cents]) => {
              const k = balanceKind(cents)
              return (
                <li key={id} className="flex min-h-15 items-center gap-3 px-3.5 py-2.5">
                  <PersonDot person={people.get(id)} />
                  <span className="min-w-0 flex-1 break-words font-semibold">{people.get(id)?.name ?? es.expenses.someone}</span>
                  <span className={`flex-none font-bold tabular-nums ${TONE[k]}`}>
                    {k === 'owed' ? T.isOwed(formatCents(cents)) : k === 'owes' ? T.owes(formatCents(-cents)) : T.settled}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {me && (
        <SettlementSheet
          payment={registering}
          groupId={groupId}
          memberIds={[...balances.keys()]}
          me={me}
          onClose={() => setRegistering(null)}
          onDone={(amountCents) => {
            const done = registering!
            setRegistering(null)
            onSettled(done, amountCents)
          }}
        />
      )}
    </>
  )
}
