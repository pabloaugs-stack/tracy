'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  changeStatusAction,
  getComandaDetailAction,
  updateAppointmentAction,
  type AppointmentActionState,
} from '@/app/actions/appointments'
import type { AppointmentDetail } from '@/lib/queries/appointments'
import type { AppointmentPaymentCompact } from '@/lib/queries/appointment-payments'
import type { AppointmentProductLine } from '@/lib/queries/appointment-products'
import type { AppointmentMaterialLine } from '@/lib/queries/appointment-materials'
import type { AppointmentStatus } from '@/lib/types/database'
import type {
  ClientRow,
  ServiceRow,
  ServiceCategoryRow,
  UserRow,
  MaterialColorRow,
  PaymentMethodRow,
  ProductRow,
} from '@/lib/types/database'
import { ComandaForm, type ComandaInitialData } from '../nova-comanda/_components/ComandaForm'
import { CloseReopenButton } from '../[id]/_components/CloseReopenButton'
import { formatAppointmentNumber } from '@/lib/appointments/format'
import { ComandaProductsSection } from './ComandaProductsSection'
import { ComandaMaterialsSection } from './ComandaMaterialsSection'
import type { CurrentUser, DepositDefault, ProductConfig } from './AgendaGrid'
import type { CardMachineTree } from '@/lib/queries/card-machines'

interface Props {
  appointmentId: string
  currentUser: CurrentUser
  clients: ClientRow[]
  categories: ServiceCategoryRow[]
  services: ServiceRow[]
  professionals: UserRow[]
  colors: MaterialColorRow[]
  paymentMethods: PaymentMethodRow[]
  cardTree: CardMachineTree[]
  cardFeePassthrough: boolean
  depositDefault: DepositDefault
  catalogProducts: ProductRow[]
  productConfig: ProductConfig
  onClose: () => void
  onAfterAction: () => void
}

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

const ROLE_LABELS = { trancista: 'Trancista', auxiliar: 'Auxiliar' } as const
const PAYMENT_TYPE_LABELS = { sinal: 'Sinal', final: 'Final' } as const

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

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}

function brazilDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function brazilTimeHM(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h}:${m}`
}

function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function friendlyError(code: string): string {
  if (code === 'sem_permissao_para_iniciar_atendimento')
    return 'Você não tem permissão para iniciar este atendimento.'
  if (code === 'sem_permissao_para_fechar_comanda')
    return 'Você não tem permissão para fechar esta comanda.'
  return code
}

const sectionHeaderCls = 'text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-2'
const cardCls = 'bg-tracy-surface border border-tracy-border rounded-xl p-4'

export function ComandaDetailModal(props: Props) {
  const { appointmentId, currentUser, onClose, onAfterAction } = props

  const [detail, setDetail] = useState<AppointmentDetail | null>(null)
  const [payments, setPayments] = useState<AppointmentPaymentCompact[]>([])
  const [products, setProducts] = useState<AppointmentProductLine[]>([])
  const [materials, setMaterials] = useState<AppointmentMaterialLine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // O modal é remontado por `key={selectedId}` no AgendaGrid, então o estado inicial (loading=true)
  // já vale a cada abertura — não chamamos setState síncrono dentro do efeito.
  useEffect(() => {
    let active = true
    getComandaDetailAction(appointmentId).then((res) => {
      if (!active) return
      if ('error' in res) {
        setLoadError(res.error)
      } else {
        setDetail(res.detail)
        setPayments(res.payments)
        setProducts(res.products)
        setMaterials(res.materials)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [appointmentId])

  // Recarrega detalhe sem fechar o modal (após mexer em produtos/materiais).
  function reloadDetail() {
    getComandaDetailAction(appointmentId).then((res) => {
      if ('error' in res) return
      setDetail(res.detail)
      setPayments(res.payments)
      setProducts(res.products)
      setMaterials(res.materials)
    })
  }

  // ── Derivados ──
  const isClosed = detail?.closed_at != null
  const status = detail?.status ?? 'agendado'
  const isCancelled = status === 'cancelado' || status === 'nao_compareceu'
  const allocated = !!detail?.professionals.some((p) => p.user_id === currentUser.id)

  const productsTotal = products.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)
  const finalTotal = detail
    ? computeFinalTotal(detail.total_price, detail.discount_type, detail.discount_value, detail.total_override, productsTotal)
    : 0
  // Produtos editáveis: comanda aberta, não cancelada e usuário com permissão (can_create OU alocada).
  const canEditProducts = !isClosed && !isCancelled && (currentUser.canCreate || allocated)
  const activeSinais = payments.filter((p) => p.active && p.payment_type === 'sinal')
  const totalSinais = activeSinais.reduce((s, p) => s + Number(p.amount), 0)
  const saldo = Math.max(0, finalTotal - totalSinais)
  const activeSinal = activeSinais[0] ?? null

  // Base de comissão de serviço (Sprint 7 / Fatia 3): valor cheio vs. valor do serviço com desconto
  // (sem produtos). O toggle no fechamento só aparece quando há desconto.
  const commissionHasDiscount = !!detail && (!!detail.discount_type || (detail.discount_value != null && Number(detail.discount_value) > 0))
  const commissionValorCheio = detail ? Number(detail.total_price) : 0
  const commissionValorComDesconto = detail
    ? computeFinalTotal(detail.total_price, detail.discount_type, detail.discount_value, detail.total_override, 0)
    : 0

  const showIniciar = !isClosed && status === 'agendado' && (currentUser.canCreate || allocated)
  const showEditar = !isClosed && !isCancelled && currentUser.canCreate
  const showCancelar = !isClosed && !isCancelled && currentUser.canCreate
  // Fechar: can_close OU profissional alocada (caso "dona solo"). Reabrir continua só can_close.
  const showFechar = !isClosed && status === 'em_andamento' && (currentUser.canClose || allocated)
  const showReabrir = isClosed && currentUser.canClose

  function handleIniciar() {
    setActionError(null)
    startTransition(async () => {
      const r = await changeStatusAction(appointmentId, 'em_andamento')
      if (r.error) {
        setActionError(friendlyError(r.error))
        return
      }
      onAfterAction()
    })
  }

  function handleCancelar() {
    if (!window.confirm('Cancelar esta comanda? Esta ação pode ser revertida.')) return
    setActionError(null)
    startTransition(async () => {
      const r = await changeStatusAction(appointmentId, 'cancelado')
      if (r.error) {
        setActionError(friendlyError(r.error))
        return
      }
      onAfterAction()
    })
  }

  // Action de edição: chama updateAppointmentAction e, no sucesso, fecha + atualiza o grid.
  const editAction = async (
    prev: AppointmentActionState,
    fd: FormData
  ): Promise<AppointmentActionState> => {
    const result = await updateAppointmentAction(appointmentId, prev, fd)
    if (result?.error) return result
    onAfterAction()
    return undefined
  }

  function buildInitialData(d: AppointmentDetail): ComandaInitialData {
    return {
      clientId: d.client.id,
      serviceId: d.service.id,
      date: brazilDate(d.scheduled_at),
      time: brazilTimeHM(d.scheduled_at),
      notes: d.notes ?? '',
      professionals: d.professionals.map((p) => ({
        user_id: p.user_id,
        role_in_appointment: p.role_in_appointment,
        commission_override: p.commission_override != null ? String(p.commission_override) : '',
      })),
      discountType: d.discount_type ?? '',
      discountValue: d.discount_value != null ? String(d.discount_value) : '',
      totalOverride: d.total_override != null ? String(d.total_override) : '',
      depositType: d.deposit_type ?? '',
      depositValue: d.deposit_value != null ? String(d.deposit_value) : '',
      depositPaymentMethodId: activeSinal?.payment_method.id ?? '',
      depositPaidAt: activeSinal?.paid_at ?? brazilToday(),
      hasActiveSinal: !!activeSinal,
    }
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
        {loading ? (
          <div className="p-8 text-center text-sm text-tracy-muted">Carregando…</div>
        ) : loadError || !detail ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-400">{loadError ?? 'Comanda não encontrada.'}</p>
            <button onClick={onClose} className="mt-4 text-xs text-tracy-muted hover:text-tracy-text">
              Fechar
            </button>
          </div>
        ) : mode === 'edit' ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black tracking-tight text-tracy-text">Editar comanda</h2>
              <button onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg">
                ✕
              </button>
            </div>
            <ComandaForm
              action={editAction}
              clients={props.clients}
              categories={props.categories}
              services={props.services}
              professionals={props.professionals}
              paymentMethods={props.paymentMethods}
              colors={props.colors}
              defaultDate={brazilToday()}
              canManageClients={currentUser.canManageClients}
              discountLimitPercent={currentUser.discountLimitPercent}
              depositDefault={props.depositDefault}
              cardTree={props.cardTree}
              cardFeePassthrough={props.cardFeePassthrough}
              canEditCommission={currentUser.canEditCommission}
              mode="edit"
              initialData={buildInitialData(detail)}
              onCancel={() => setMode('view')}
            />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black tracking-tight text-tracy-text">{detail.client.name}</h2>
                  <span className="text-[11px] font-semibold tabular-nums text-tracy-muted bg-tracy-surface border border-tracy-border rounded px-1.5 py-0.5">
                    {formatAppointmentNumber(detail.appointment_number)}
                  </span>
                </div>
                <p className="text-tracy-muted text-xs mt-0.5">{formatDateTime(detail.scheduled_at)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[10px] font-bold border rounded px-2 py-0.5 uppercase tracking-widest ${STATUS_COLORS[status]}`}>
                    {STATUS_LABELS[status]}
                  </span>
                  {isClosed && (
                    <span className="text-[10px] font-bold border border-tracy-muted/30 text-tracy-muted rounded px-2 py-0.5 uppercase tracking-widest">
                      Fechada
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} aria-label="Fechar" className="text-tracy-muted hover:text-tracy-text text-lg shrink-0">
                ✕
              </button>
            </div>

            {/* Serviço + total */}
            <div className={cardCls}>
              <p className={sectionHeaderCls}>Serviço</p>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-tracy-text">{detail.service.name}</p>
                  {detail.service.estimated_duration_min && (
                    <p className="text-xs text-tracy-muted mt-0.5">{detail.service.estimated_duration_min} min estimados</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-black tabular-nums text-tracy-text">{formatBRL(finalTotal)}</p>
                  {(detail.discount_type || detail.total_override !== null) && (
                    <p className="text-xs text-tracy-muted tabular-nums line-through">{formatBRL(detail.total_price)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Produtos */}
            <ComandaProductsSection
              appointmentId={appointmentId}
              lines={products}
              catalogProducts={props.catalogProducts}
              allocatedProfessionals={detail.professionals.map((p) => ({ user_id: p.user_id, name: p.user.name }))}
              commissionEnabled={props.productConfig.commissionEnabled}
              allowEditPrice={props.productConfig.allowEditPrice}
              canEdit={canEditProducts}
              onChanged={reloadDetail}
            />

            {/* Sinal */}
            {detail.deposit_type && detail.deposit_value != null && (
              <div className={cardCls}>
                <p className={sectionHeaderCls}>Sinal</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-tracy-muted">
                    {detail.deposit_type === 'percent' ? `${detail.deposit_value}%` : 'Valor fixo'}
                    {activeSinal && ` · ${activeSinal.payment_method.name}`}
                  </span>
                  <div className="text-right tabular-nums">
                    <span className="text-tracy-text font-semibold">{formatBRL(totalSinais)}</span>
                    <span className="text-tracy-muted ml-3">Restante: {formatBRL(saldo)}</span>
                  </div>
                </div>
                {activeSinal && (
                  <p className="text-[11px] text-tracy-muted mt-1">
                    Recebido em {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(`${activeSinal.paid_at}T12:00:00-03:00`))}
                  </p>
                )}
              </div>
            )}

            {/* Cliente */}
            <div className={cardCls}>
              <p className={sectionHeaderCls}>Cliente</p>
              <p className="text-sm text-tracy-text">{detail.client.name}</p>
              {detail.client.phone && <p className="text-xs text-tracy-muted mt-0.5">{detail.client.phone}</p>}
            </div>

            {/* Profissionais */}
            {detail.professionals.length > 0 && (
              <div className={cardCls}>
                <p className={sectionHeaderCls}>Equipe</p>
                <div className="space-y-1.5">
                  {detail.professionals.map((p) => (
                    <div key={p.user_id} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-tracy-text">{p.user.name}</span>
                        <span className="ml-2 text-[10px] text-tracy-muted uppercase tracking-wide">
                          {ROLE_LABELS[p.role_in_appointment]}
                        </span>
                      </div>
                      {p.commission_override !== null && (
                        <span className="text-xs text-tracy-muted tabular-nums">{p.commission_override}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Materiais (cores) — linhas vivas com baixa de estoque */}
            <ComandaMaterialsSection
              appointmentId={appointmentId}
              lines={materials}
              colors={props.colors}
              canEdit={canEditProducts}
              onChanged={reloadDetail}
            />

            {/* Observações */}
            {detail.notes && (
              <div className={cardCls}>
                <p className={sectionHeaderCls}>Observações</p>
                <p className="text-sm text-tracy-text whitespace-pre-wrap">{detail.notes}</p>
              </div>
            )}

            {/* Histórico de pagamentos */}
            {payments.filter((p) => p.active).length > 0 && (
              <div className={cardCls}>
                <p className={sectionHeaderCls}>Pagamentos</p>
                <div className="space-y-1.5">
                  {payments
                    .filter((p) => p.active)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-tracy-text">
                          {PAYMENT_TYPE_LABELS[p.payment_type]}
                          <span className="text-tracy-muted ml-2 text-xs">{p.payment_method.name}</span>
                        </span>
                        <span className="tabular-nums text-tracy-text">{formatBRL(Number(p.amount))}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {actionError && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {actionError}
              </p>
            )}

            {isClosed && (
              <p className="text-xs text-tracy-muted">Comanda fechada — reabra para editar.</p>
            )}

            {/* Rodapé contextual */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {showIniciar && (
                <button
                  onClick={handleIniciar}
                  disabled={pending}
                  className="text-xs font-semibold bg-tracy-gold text-tracy-bg rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {pending ? '…' : 'Iniciar atendimento'}
                </button>
              )}
              {(showFechar || showReabrir) && (
                <CloseReopenButton
                  appointmentId={appointmentId}
                  isClosed={isClosed}
                  saldo={saldo}
                  paymentMethods={props.paymentMethods.map((m) => ({ id: m.id, name: m.name, kind: m.kind }))}
                  cardTree={props.cardTree}
                  cardFeePassthrough={props.cardFeePassthrough}
                  commissionHasDiscount={commissionHasDiscount}
                  commissionValorCheio={commissionValorCheio}
                  commissionValorComDesconto={commissionValorComDesconto}
                  onDone={onAfterAction}
                />
              )}
              {showEditar && (
                <button
                  onClick={() => setMode('edit')}
                  disabled={pending}
                  className="text-xs font-semibold border border-tracy-border text-tracy-text rounded-lg px-3 py-1.5 hover:border-tracy-muted transition-colors disabled:opacity-50"
                >
                  Editar
                </button>
              )}
              {showCancelar && (
                <button
                  onClick={handleCancelar}
                  disabled={pending}
                  className="text-xs font-semibold border border-tracy-border text-tracy-muted rounded-lg px-3 py-1.5 hover:text-red-400 hover:border-red-400/40 transition-colors disabled:opacity-50"
                >
                  Cancelar comanda
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
