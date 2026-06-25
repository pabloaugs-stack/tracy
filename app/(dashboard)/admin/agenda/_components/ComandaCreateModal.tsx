'use client'

import {
  createAppointmentInlineAction,
  type AppointmentActionState,
} from '@/app/actions/appointments'
import type {
  ClientRow,
  ServiceRow,
  ServiceCategoryRow,
  UserRow,
  PaymentMethodRow,
} from '@/lib/types/database'
import { ComandaForm, type ComandaInitialData } from '../nova-comanda/_components/ComandaForm'
import type { CurrentUser, DepositDefault } from './AgendaGrid'
import type { CardMachineTree } from '@/lib/queries/card-machines'

interface Props {
  // Slot clicado no grid: profissional da coluna + horário da linha (HH:MM).
  prefill: { professionalId: string; time: string }
  // Dia exibido na agenda (YYYY-MM-DD) — a comanda nasce neste dia.
  selectedDate: string
  // Hoje (YYYY-MM-DD, Brasília) — usado como defaultDate do form (limite do sinal).
  today: string
  currentUser: CurrentUser
  clients: ClientRow[]
  categories: ServiceCategoryRow[]
  services: ServiceRow[]
  professionals: UserRow[]
  paymentMethods: PaymentMethodRow[]
  cardTree: CardMachineTree[]
  cardFeePassthrough: boolean
  depositDefault: DepositDefault
  onClose: () => void
  onAfterAction: () => void
}

function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function ComandaCreateModal(props: Props) {
  const { prefill, selectedDate, today, currentUser, onClose, onAfterAction } = props

  // Action de criação: cria sem redirect e, no sucesso, fecha o modal + refresh do grid.
  const createAction = async (
    prev: AppointmentActionState,
    fd: FormData
  ): Promise<AppointmentActionState> => {
    const result = await createAppointmentInlineAction(prev, fd)
    if (result?.error) return result
    onAfterAction()
    return undefined
  }

  // Pré-preenche profissional (coluna) e horário (linha). O sinal usa o default do salão —
  // mapeamos depositDefault em depositType/depositValue porque initialData substitui esse default.
  const initialData: ComandaInitialData = {
    clientId: '',
    serviceId: '',
    date: selectedDate,
    time: prefill.time,
    notes: '',
    professionals: [
      { user_id: prefill.professionalId, role_in_appointment: 'trancista', commission_override: '' },
    ],
    discountType: '',
    discountValue: '',
    totalOverride: '',
    depositType: props.depositDefault.enabled && props.depositDefault.type ? props.depositDefault.type : '',
    depositValue:
      props.depositDefault.enabled && props.depositDefault.value != null
        ? String(props.depositDefault.value)
        : '',
    depositPaymentMethodId: '',
    depositPaidAt: brazilToday(),
    hasActiveSinal: false,
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-tracy-bg border border-tracy-border rounded-2xl w-full max-w-lg my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black tracking-tight text-tracy-text">Novo atendimento</h2>
            <button onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg">
              ✕
            </button>
          </div>
          <ComandaForm
            action={createAction}
            clients={props.clients}
            categories={props.categories}
            services={props.services}
            professionals={props.professionals}
            paymentMethods={props.paymentMethods}
            defaultDate={today}
            canManageClients={currentUser.canManageClients}
            discountLimitPercent={currentUser.discountLimitPercent}
            depositDefault={props.depositDefault}
            cardTree={props.cardTree}
            cardFeePassthrough={props.cardFeePassthrough}
            mode="create"
            initialData={initialData}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
