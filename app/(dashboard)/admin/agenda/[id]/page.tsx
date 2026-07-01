import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { getAppointmentById } from '@/lib/queries/appointments'
import { getAppointmentPayments } from '@/lib/queries/appointment-payments'
import { getActiveAppointmentProducts, sumProductsSubtotal } from '@/lib/queries/appointment-products'
import { listActivePaymentMethods } from '@/lib/queries/payment-methods'
import { listActiveCardMachineTree } from '@/lib/queries/card-machines'
import { getSalonSettings } from '@/app/actions/salon-settings'
import type { AppointmentStatus, RoleInAppointment, MaterialType, PaymentMethodKind } from '@/lib/types/database'
import type { CardMachineTree } from '@/lib/queries/card-machines'
import StatusForm from './_components/StatusForm'
import { CloseReopenButton } from './_components/CloseReopenButton'

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  agendado: 'text-tracy-gold border-tracy-gold/30',
  em_andamento: 'text-blue-400 border-blue-400/30',
  concluido: 'text-green-400 border-green-400/30',
  cancelado: 'text-red-400/60 border-red-400/20',
  nao_compareceu: 'text-tracy-muted border-tracy-border',
}

const ROLE_LABELS: Record<RoleInAppointment, string> = {
  trancista: 'Trancista',
  auxiliar: 'Auxiliar',
}

const MATERIAL_LABELS: Record<MaterialType, string> = {
  jumbo: 'Jumbo',
  cachos: 'Cachos',
}

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(isoDate))
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function computeFinalTotal(
  totalPrice: number,
  discountType: string | null,
  discountValue: number | null,
  totalOverride: number | null,
  productsTotal: number = 0
): number {
  if (totalOverride !== null) return totalOverride
  const base = totalPrice + productsTotal
  if (!discountType || discountValue === null) return base
  if (discountType === 'fixed') return Math.max(0, base - discountValue)
  return Math.max(0, base * (1 - discountValue / 100))
}

export default async function ComandaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [profile, appt, productLines] = await Promise.all([
    getSessionProfile(),
    getAppointmentById(id),
    getActiveAppointmentProducts(id),
  ])

  if (!appt) notFound()

  const productsTotal = sumProductsSubtotal(productLines)

  const canChangeStatus = profile.can_create_appointments
  // Reabrir é financeiro-sensível → continua só role-based. Fechar permite também a profissional
  // alocada nesta comanda (caso "dona solo"), espelhando o gate de closeAppointmentAction.
  const allocated = appt.professionals.some((p) => p.user_id === profile.id)
  const canReopen = profile.can_close_appointments
  const isClosed = appt.closed_at !== null
  const canCloseThis = canReopen || allocated
  // Seção de fechamento: aparece para quem pode reabrir (qualquer estado) OU para a alocada numa comanda aberta.
  const showFechamento = canReopen || (allocated && !isClosed)

  const finalTotal = computeFinalTotal(
    appt.total_price,
    appt.discount_type,
    appt.discount_value,
    appt.total_override,
    productsTotal
  )
  const hasDiscount = appt.discount_type && appt.discount_value
  const isManualTotal = appt.total_override !== null

  // Saldo a receber no fechamento (mesma conta de closeAppointmentAction): total final − sinais ativos.
  // Só carregado quando faz sentido fechar (pode fechar e está aberta), pra alimentar o modal de pagamento.
  let saldo = 0
  let activeMethods: { id: string; name: string; kind: PaymentMethodKind }[] = []
  let cardTree: CardMachineTree[] = []
  let cardFeePassthrough = false
  if (canCloseThis && !isClosed) {
    const [payments, methods, tree, settings] = await Promise.all([
      getAppointmentPayments(appt.id),
      listActivePaymentMethods(profile.salon_id),
      listActiveCardMachineTree(profile.salon_id),
      getSalonSettings(),
    ])
    const totalSinais = payments
      .filter((p) => p.active && p.payment_type === 'sinal')
      .reduce((sum, p) => sum + Number(p.amount), 0)
    saldo = Math.max(0, finalTotal - totalSinais)
    activeMethods = methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind }))
    cardTree = tree
    cardFeePassthrough = settings?.card_fee_passthrough_enabled ?? false
  }

  return (
    <div>
      <Link
        href="/admin/agenda"
        className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6"
      >
        ← Agenda
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-tracy-text">
            {appt.client.name}
          </h1>
          <p className="text-tracy-muted text-sm mt-0.5">{formatDateTime(appt.scheduled_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold border rounded px-2 py-0.5 uppercase tracking-widest ${STATUS_COLORS[appt.status]}`}
          >
            {STATUS_LABELS[appt.status]}
          </span>
          {isClosed && (
            <span className="text-[10px] font-bold border border-tracy-muted/30 text-tracy-muted rounded px-2 py-0.5 uppercase tracking-widest">
              Fechada
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Serviço e valor */}
        <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
          <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3">
            Serviço
          </h2>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-tracy-text">{appt.service.name}</p>
              {appt.service.estimated_duration_min && (
                <p className="text-xs text-tracy-muted mt-1">
                  {appt.service.estimated_duration_min} min estimados
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-black tabular-nums text-tracy-text">
                {formatBRL(finalTotal)}
              </p>
              {(hasDiscount || isManualTotal) && (
                <p className="text-xs text-tracy-muted tabular-nums line-through mt-0.5">
                  {formatBRL(appt.total_price)}
                </p>
              )}
              {hasDiscount && !isManualTotal && (
                <p className="text-xs text-red-400 tabular-nums">
                  − {appt.discount_type === 'fixed'
                    ? formatBRL(appt.discount_value!)
                    : `${appt.discount_value}%`}
                </p>
              )}
              {isManualTotal && (
                <p className="text-[10px] text-tracy-muted border border-tracy-border rounded px-1.5 py-0.5 uppercase tracking-wide inline-block mt-1">
                  manual
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sinal */}
        {appt.deposit_type && appt.deposit_value != null && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
            <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3">
              Sinal
            </h2>
            {(() => {
              const depositAmt =
                appt.deposit_type === 'fixed'
                  ? appt.deposit_value
                  : finalTotal * (appt.deposit_value / 100)
              const restante = Math.max(0, finalTotal - depositAmt)
              return (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-tracy-muted">
                    Sinal{appt.deposit_type === 'percent' ? ` (${appt.deposit_value}%)` : ''}
                  </span>
                  <div className="text-right tabular-nums">
                    <span className="text-tracy-text font-semibold">{formatBRL(depositAmt)}</span>
                    <span className="text-tracy-muted ml-3">Restante: {formatBRL(restante)}</span>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Cliente */}
        <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
          <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3">
            Cliente
          </h2>
          <p className="text-sm text-tracy-text">{appt.client.name}</p>
          {appt.client.phone && (
            <p className="text-xs text-tracy-muted mt-1">{appt.client.phone}</p>
          )}
        </div>

        {/* Profissionais */}
        {appt.professionals.length > 0 && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
            <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3">
              Equipe
            </h2>
            <div className="space-y-2">
              {appt.professionals.map((prof) => (
                <div key={prof.user_id} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-tracy-text">{prof.user.name}</span>
                    <span className="ml-2 text-[10px] text-tracy-muted uppercase tracking-wide">
                      {ROLE_LABELS[prof.role_in_appointment]}
                    </span>
                  </div>
                  {prof.commission_override !== null && (
                    <span className="text-xs text-tracy-muted tabular-nums">
                      {prof.commission_override}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Materiais */}
        {appt.materials.length > 0 && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
            <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3">
              Materiais
            </h2>
            <div className="space-y-1.5">
              {appt.materials.map((mat) => (
                <div key={mat.id} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-tracy-gold uppercase tracking-wide w-12 shrink-0">
                    {MATERIAL_LABELS[mat.type]}
                  </span>
                  <span className="text-sm text-tracy-text">{mat.color.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observações */}
        {appt.notes && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
            <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-2">
              Observações
            </h2>
            <p className="text-sm text-tracy-text whitespace-pre-wrap">{appt.notes}</p>
          </div>
        )}

        {/* Status */}
        <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
          <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-2">
            Status
          </h2>
          {canChangeStatus ? (
            <StatusForm appointmentId={appt.id} currentStatus={appt.status} isLocked={isClosed} />
          ) : (
            <p className="text-sm text-tracy-text">{STATUS_LABELS[appt.status]}</p>
          )}
        </div>

        {/* Fechar / Reabrir */}
        {showFechamento && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5">
            <h2 className="text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3">
              Fechamento
            </h2>
            <p className="text-xs text-tracy-muted mb-3">
              {isClosed
                ? `Fechada em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(appt.closed_at!))}.`
                : 'Fechar a comanda impede novas alterações de campos e status.'}
            </p>
            <CloseReopenButton
              appointmentId={appt.id}
              isClosed={isClosed}
              saldo={saldo}
              paymentMethods={activeMethods}
              cardTree={cardTree}
              cardFeePassthrough={cardFeePassthrough}
              commissionHasDiscount={!!hasDiscount}
              commissionValorCheio={Number(appt.total_price)}
              commissionValorComDesconto={computeFinalTotal(appt.total_price, appt.discount_type, appt.discount_value, appt.total_override, 0)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
