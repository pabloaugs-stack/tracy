'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeAppointmentAction, reopenAppointmentAction } from '@/app/actions/appointments'
import { PaymentSplitModal, type PaymentMethodOption } from '../../_components/PaymentSplitModal'
import type { CardMachineTree } from '@/lib/queries/card-machines'

interface Props {
  appointmentId: string
  isClosed: boolean
  saldo: number
  paymentMethods: PaymentMethodOption[]
  cardTree: CardMachineTree[]
  cardFeePassthrough: boolean
  // Base de comissão de serviço (Sprint 7 / Fatia 3) — usada pelo toggle de desconto no modal.
  commissionHasDiscount?: boolean
  commissionValorCheio?: number
  commissionValorComDesconto?: number
  // Quando fornecido, é chamado após fechar/reabrir com sucesso (ex.: fechar o modal + refresh).
  onDone?: () => void
}

export function CloseReopenButton({ appointmentId, isClosed, saldo, paymentMethods, cardTree, cardFeePassthrough, commissionHasDiscount, commissionValorCheio, commissionValorComDesconto, onDone }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)

  function done() {
    if (onDone) onDone()
    else router.refresh()
  }

  function handleCloseClick() {
    // Sinal cobre tudo → fecha direto (sem linhas). Caso contrário, abre o modal de pagamento dividido.
    if (saldo <= 0) {
      setError(null)
      startTransition(async () => {
        const result = await closeAppointmentAction(appointmentId, [])
        if (result.error) { setError(result.error); return }
        done()
      })
    } else {
      setError(null)
      setModalOpen(true)
    }
  }

  function handleReopen() {
    setError(null)
    startTransition(async () => {
      const result = await reopenAppointmentAction(appointmentId)
      if (result.error) { setError(result.error); return }
      done()
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={isClosed ? handleReopen : handleCloseClick}
        disabled={isPending}
        className={`text-xs font-semibold border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 ${
          isClosed
            ? 'border-tracy-gold text-tracy-gold hover:bg-tracy-gold/10'
            : 'border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted'
        }`}
      >
        {isPending ? '…' : isClosed ? 'Reabrir comanda' : 'Fechar comanda'}
      </button>
      {error && !modalOpen && <p className="text-xs text-red-400">{error}</p>}

      {modalOpen && (
        <PaymentSplitModal
          appointmentId={appointmentId}
          saldo={saldo}
          paymentMethods={paymentMethods}
          cardTree={cardTree}
          cardFeePassthrough={cardFeePassthrough}
          commissionHasDiscount={commissionHasDiscount}
          commissionValorCheio={commissionValorCheio}
          commissionValorComDesconto={commissionValorComDesconto}
          onClose={() => setModalOpen(false)}
          onDone={() => { setModalOpen(false); done() }}
        />
      )}
    </div>
  )
}
