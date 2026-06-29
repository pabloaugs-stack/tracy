'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { createClientInlineAction } from '@/app/actions/clients'
import type { AppointmentActionState } from '@/app/actions/appointments'
import type {
  ClientRow,
  ServiceRow,
  ServiceCategoryRow,
  UserRow,
  PaymentMethodRow,
  MaterialColorRow,
  RoleInAppointment,
} from '@/lib/types/database'
import type { CardMachineTree } from '@/lib/queries/card-machines'
import { CARD_BRAND_LABELS } from '@/lib/card-templates'
import { ComandaMaterialsCreateSection } from './ComandaMaterialsCreateSection'

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface ProfEntry {
  key: number
  user_id: string
  role_in_appointment: RoleInAppointment
  commission_override: string
}

// Dados para pré-preencher o form no modo edição.
// Materiais NÃO entram no initialData: na CRIAÇÃO são escolhidos em estado local na própria seção
// (ComandaMaterialsCreateSection) e serializados no FormData; na EDIÇÃO viram linhas vivas no modal.
export interface ComandaInitialData {
  clientId: string
  serviceId: string
  date: string
  time: string
  notes: string
  professionals: { user_id: string; role_in_appointment: RoleInAppointment; commission_override: string }[]
  discountType: 'fixed' | 'percent' | ''
  discountValue: string
  totalOverride: string
  depositType: 'fixed' | 'percent' | ''
  depositValue: string
  depositPaymentMethodId: string
  depositPaidAt: string
  hasActiveSinal: boolean
}

interface Props {
  action: (prevState: AppointmentActionState, formData: FormData) => Promise<AppointmentActionState>
  clients: ClientRow[]
  categories: ServiceCategoryRow[]
  services: ServiceRow[]
  professionals: UserRow[]
  paymentMethods: PaymentMethodRow[]
  // Cores de material ativas do salão — usadas pela seção de material na CRIAÇÃO (modo create).
  colors: MaterialColorRow[]
  defaultDate: string
  canManageClients: boolean
  discountLimitPercent: number | null
  // Default de sinal vindo de salon_settings; serve só de pré-preenchimento, editável no form.
  depositDefault: { enabled: boolean; type: 'fixed' | 'percent' | null; value: number | null }
  // Árvore de cartão ativa — usada quando a forma do sinal é crédito.
  cardTree: CardMachineTree[]
  // Repasse de taxa de cartão ao cliente (salon_settings) — só muda a EXIBIÇÃO ("cobrar no cartão").
  cardFeePassthrough: boolean
  mode?: 'create' | 'edit'
  initialData?: ComandaInitialData
  onCancel?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPrice(value: number): string {
  if (value === 0) return ''
  return ` — ${formatBRL(value)}`
}

// Traduz códigos de erro do servidor (insertAppointment) para mensagem amigável.
// Códigos não mapeados caem no default (texto cru) — comportamento anterior preservado.
function translateFormError(code: string): string {
  switch (code) {
    case 'estoque_insumo_insuficiente':
      return 'Estoque de material insuficiente para a cor escolhida. Reponha o estoque ou remova a cor.'
    case 'credito_requer_dados_cartao':
      return 'Selecione maquininha, bandeira e parcelamento do sinal no crédito.'
    case 'arvore_cartao_inconsistente':
      return 'Configuração de cartão inconsistente. Revise as maquininhas em Configurações.'
    case 'data_sinal_invalida':
      return 'A data do recebimento do sinal não pode ser futura.'
    default:
      return code
  }
}

function computeFinalTotal(
  basePrice: number,
  discountType: 'fixed' | 'percent' | '',
  discountValue: string,
  override: string
): number {
  if (override !== '') return parseFloat(override) || 0
  const dv = parseFloat(discountValue) || 0
  if (!discountType || !dv) return basePrice
  if (discountType === 'fixed') return Math.max(0, basePrice - dv)
  return Math.max(0, basePrice * (1 - dv / 100))
}

// ── Estilos compartilhados ────────────────────────────────────────────────────

const inputCls =
  'w-full bg-tracy-surface border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold'
const innerInputCls =
  'w-full bg-tracy-bg border border-tracy-border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold placeholder:text-tracy-muted/60'
const labelCls = 'block text-sm text-tracy-muted mb-1.5'
const sectionHeaderCls =
  'text-[10px] font-bold text-tracy-muted uppercase tracking-widest mb-3'

// ── Componente ────────────────────────────────────────────────────────────────

export function ComandaForm({
  action,
  clients,
  categories,
  services,
  professionals,
  paymentMethods,
  colors,
  defaultDate,
  canManageClients,
  discountLimitPercent,
  depositDefault,
  cardTree,
  cardFeePassthrough,
  mode = 'create',
  initialData,
  onCancel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const [localProfError, setLocalProfError] = useState<string | null>(null)

  // Cliente
  const [localClients, setLocalClients] = useState(clients)
  const [selectedClientId, setSelectedClientId] = useState(initialData?.clientId ?? '')
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientError, setNewClientError] = useState<string | null>(null)
  const [clientPending, startClientTransition] = useTransition()

  // Serviço
  const [selectedServiceId, setSelectedServiceId] = useState(initialData?.serviceId ?? '')

  // Profissionais
  const [profEntries, setProfEntries] = useState<ProfEntry[]>(
    initialData?.professionals.map((p, i) => ({ key: i, ...p })) ?? []
  )
  const [profKey, setProfKey] = useState(initialData?.professionals.length ?? 0)

  // Desconto
  const [discountType, setDiscountType] = useState<'fixed' | 'percent' | ''>(initialData?.discountType ?? '')
  const [discountValue, setDiscountValue] = useState(initialData?.discountValue ?? '')

  // Total override
  const [totalOverride, setTotalOverride] = useState(initialData?.totalOverride ?? '')
  const [showTotalOverride, setShowTotalOverride] = useState((initialData?.totalOverride ?? '') !== '')

  // Sinal — pré-preenchido pelos dados da comanda (edição) ou pelo default do salão (criação).
  const [depositType, setDepositType] = useState<'fixed' | 'percent' | ''>(
    initialData
      ? initialData.depositType
      : depositDefault.enabled && depositDefault.type
        ? depositDefault.type
        : ''
  )
  const [depositValue, setDepositValue] = useState(
    initialData
      ? initialData.depositValue
      : depositDefault.enabled && depositDefault.value != null
        ? String(depositDefault.value)
        : ''
  )
  const [depositPaymentMethodId, setDepositPaymentMethodId] = useState(initialData?.depositPaymentMethodId ?? '')
  const [depositPaidAt, setDepositPaidAt] = useState(initialData?.depositPaidAt ?? defaultDate)
  // Cartão do sinal (só quando a forma é crédito)
  const [depCardMachineId, setDepCardMachineId] = useState('')
  const [depCardBrandId, setDepCardBrandId] = useState('')
  const [depCardInstallmentId, setDepCardInstallmentId] = useState('')

  // Em edição o sinal é somente-leitura: o update não reconcilia appointment_payments,
  // então evitamos divergência entre appointments.deposit_* e o pagamento registrado.
  const depositLocked = mode === 'edit'
  const isEdit = mode === 'edit'

  // ── Computados ──────────────────────────────────────────────────────────────

  const selectedService = services.find((s) => s.id === selectedServiceId) ?? null
  const basePrice = selectedService?.price ?? 0

  const discountLimitError: string | null = (() => {
    if (discountLimitPercent === null || !discountType || !discountValue) return null
    const dv = parseFloat(discountValue) || 0
    if (!dv) return null
    const pct = discountType === 'percent' ? dv : (basePrice > 0 ? (dv / basePrice) * 100 : 0)
    if (pct > discountLimitPercent) {
      return `Desconto de ${pct.toFixed(1)}% excede seu limite de ${discountLimitPercent}%.`
    }
    return null
  })()

  const discountAmount =
    discountType === 'fixed'
      ? parseFloat(discountValue) || 0
      : discountType === 'percent'
        ? basePrice * ((parseFloat(discountValue) || 0) / 100)
        : 0

  const finalTotal = computeFinalTotal(basePrice, discountType, discountValue, showTotalOverride ? totalOverride : '')
  const isManualTotal = showTotalOverride && totalOverride !== ''

  // Sinal de crédito: forma kind='credito' abre os 3 dropdowns da árvore (igual ao fechamento).
  const depositMethodKind = paymentMethods.find((m) => m.id === depositPaymentMethodId)?.kind ?? null
  const depositIsCredito = depositMethodKind === 'credito'
  const depMachine = cardTree.find((m) => m.id === depCardMachineId)
  const depBrand = depMachine?.brands.find((b) => b.id === depCardBrandId)
  const depInstallment = depBrand?.installments.find((i) => i.id === depCardInstallmentId)
  const depFeePercent = depInstallment ? Number(depInstallment.fee_percent) : null
  const depositAmountNum =
    depositType === 'fixed' ? (parseFloat(depositValue) || 0)
    : depositType === 'percent' ? finalTotal * ((parseFloat(depositValue) || 0) / 100)
    : 0
  const depFeeValue = depFeePercent != null ? Math.round((depositAmountNum * depFeePercent) / 100 * 100) / 100 : null

  // Validação de sinal espelhando createAppointmentAction: valor > 0, percent <= 100, forma e data.
  // Em edição o sinal é somente-leitura — não bloqueia o salvamento dos demais campos.
  const depositError: string | null = (() => {
    if (depositLocked) return null
    if (depositType === '') return null
    const dv = parseFloat(depositValue)
    if (!dv || dv <= 0) return 'Informe um valor de sinal maior que zero.'
    if (depositType === 'percent' && dv > 100) return 'Sinal em porcentagem não pode ultrapassar 100%.'
    if (depositType === 'fixed' && dv > finalTotal) return 'Sinal não pode ser maior que o total da comanda.'
    if (paymentMethods.length === 0)
      return 'Cadastre uma forma de pagamento em Configurações para registrar o sinal.'
    if (!depositPaymentMethodId) return 'Selecione a forma de recebimento do sinal.'
    if (depositIsCredito && (!depCardMachineId || !depCardBrandId || !depCardInstallmentId))
      return 'Selecione maquininha, bandeira e parcelamento do sinal no crédito.'
    if (depositPaidAt && depositPaidAt > defaultDate)
      return 'A data do recebimento do sinal não pode ser futura.'
    return null
  })()

  // ── Handlers — profissionais ────────────────────────────────────────────────

  function addProfessional() {
    if (professionals.length === 0) return
    setProfEntries((prev) => [
      ...prev,
      {
        key: profKey,
        user_id: professionals[0].id,
        role_in_appointment: 'trancista',
        commission_override: '',
      },
    ])
    setProfKey((k) => k + 1)
  }

  function removeProf(key: number) {
    setProfEntries((prev) => prev.filter((e) => e.key !== key))
  }

  function updateProf(key: number, patch: Partial<Omit<ProfEntry, 'key'>>) {
    setProfEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)))
  }

  // ── Handler — novo cliente inline ───────────────────────────────────────────

  function handleNewClientSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNewClientError(null)
    const fd = new FormData(e.currentTarget)
    startClientTransition(async () => {
      const result = await createClientInlineAction(fd)
      if ('error' in result) {
        setNewClientError(result.error)
      } else {
        setLocalClients((prev) => [...prev, {
          id: result.id,
          name: result.name,
          phone: result.phone,
          salon_id: '',
          email: null,
          notes: null,
          last_visit_at: null,
          created_at: '',
          updated_at: '',
        }])
        setSelectedClientId(result.id)
        setShowNewClientModal(false)
        setNewClientName('')
        setNewClientPhone('')
      }
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const profError =
    localProfError ??
    (state?.error === 'profissional_obrigatorio'
      ? 'Adicione pelo menos uma profissional antes de criar a comanda.'
      : null)

  return (
    <>
      <form
        action={formAction}
        className="space-y-6"
        onSubmit={(e) => {
          if (profEntries.length === 0) {
            e.preventDefault()
            setLocalProfError('Adicione pelo menos uma profissional antes de criar a comanda.')
            return
          }
          setLocalProfError(null)
          if (discountLimitError || depositError) {
            e.preventDefault()
          }
        }}
      >
        {state?.error && state.error !== 'profissional_obrigatorio' && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {translateFormError(state.error)}
          </p>
        )}

        {/* ── CLIENTE ── */}
        <div>
          <label htmlFor="client_id" className={labelCls}>
            Cliente
          </label>
          <select
            id="client_id"
            name="client_id"
            required
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className={inputCls}
          >
            <option value="">Selecione…</option>
            {localClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` · ${c.phone}` : ''}
              </option>
            ))}
          </select>
          {canManageClients && (
            <button
              type="button"
              onClick={() => setShowNewClientModal(true)}
              className="mt-1.5 text-xs text-tracy-gold hover:underline"
            >
              + Novo cliente
            </button>
          )}
        </div>

        {/* ── SERVIÇO ── */}
        <div>
          <label htmlFor="service_id" className={labelCls}>
            Serviço
          </label>
          {services.length === 0 ? (
            <p className="text-sm text-tracy-muted">
              Nenhum serviço ativo.{' '}
              <Link href="/admin/catalogo" className="text-tracy-gold hover:underline">
                Acessar catálogo
              </Link>
            </p>
          ) : (
            <select
              id="service_id"
              name="service_id"
              required
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione…</option>
              {categories.map((cat) => {
                const catServices = services.filter((s) => s.category_id === cat.id)
                if (catServices.length === 0) return null
                return (
                  <optgroup key={cat.id} label={cat.name}>
                    {catServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{formatPrice(s.price)}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          )}
        </div>

        {/* ── DATA E HORA ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className={labelCls}>Data</label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={initialData?.date ?? defaultDate}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="time" className={labelCls}>Hora</label>
            <input
              id="time"
              name="time"
              type="time"
              defaultValue={initialData?.time ?? ''}
              required
              className={inputCls}
            />
          </div>
        </div>

        {/* ── PROFISSIONAIS ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className={`${labelCls} mb-0`}>
              Profissionais <span className="text-tracy-gold">*</span>
            </p>
            <button
              type="button"
              onClick={addProfessional}
              disabled={professionals.length === 0}
              title={professionals.length === 0 ? 'Cadastre profissionais em Equipe' : undefined}
              className="text-xs border border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Profissional
            </button>
          </div>

          {profError && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-2">
              {profError}
            </p>
          )}
          {profEntries.length === 0 ? (
            <p className={`text-[11px] text-center border border-dashed rounded-lg py-3 ${profError ? 'border-red-400/40 text-red-400/70' : 'text-tracy-muted border-tracy-border'}`}>
              {professionals.length === 0
                ? 'Cadastre profissionais em Equipe para vinculá-las aqui.'
                : 'Adicione pelo menos uma profissional à comanda.'}
            </p>
          ) : (
            <div className="space-y-2">
              {profEntries.map((entry, idx) => {
                const defaultComm =
                  entry.role_in_appointment === 'trancista'
                    ? selectedService?.commission_default_trancista ?? null
                    : selectedService?.commission_default_auxiliar ?? null

                return (
                  <div
                    key={entry.key}
                    className="flex items-start gap-2 bg-tracy-surface border border-tracy-border rounded-lg p-3"
                  >
                    <div className="flex-1 space-y-2">
                      {/* Seletor de profissional */}
                      <select
                        value={entry.user_id}
                        onChange={(e) => updateProf(entry.key, { user_id: e.target.value })}
                        className={innerInputCls}
                      >
                        {professionals.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>

                      {/* Função na comanda — independente do role de sistema */}
                      <select
                        value={entry.role_in_appointment}
                        onChange={(e) =>
                          updateProf(entry.key, {
                            role_in_appointment: e.target.value as RoleInAppointment,
                          })
                        }
                        className={innerInputCls}
                      >
                        <option value="trancista">Trancista (nesta comanda)</option>
                        <option value="auxiliar">Auxiliar (nesta comanda)</option>
                      </select>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={entry.commission_override}
                        onChange={(e) => updateProf(entry.key, { commission_override: e.target.value })}
                        placeholder={
                          defaultComm !== null
                            ? `Comissão % — padrão: ${defaultComm}%`
                            : 'Comissão % (opcional)'
                        }
                        className={innerInputCls}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeProf(entry.key)}
                      aria-label="Remover profissional"
                      className="text-tracy-muted hover:text-red-400 transition-colors mt-0.5 text-sm"
                    >
                      ✕
                    </button>

                    <input type="hidden" name={`prof_user_id_${idx}`} value={entry.user_id} />
                    <input type="hidden" name={`prof_role_${idx}`} value={entry.role_in_appointment} />
                    <input type="hidden" name={`prof_commission_${idx}`} value={entry.commission_override} />
                  </div>
                )
              })}
            </div>
          )}
          <input type="hidden" name="prof_count" value={profEntries.length} />
        </div>

        {/* ── COR DE MATERIAL (só na criação) ──
            A maioria das comandas já nasce com a cor conhecida (cliente trouxe/escolheu antes).
            Na edição, o material vira linha viva no modal (ComandaMaterialsSection), então aqui não aparece. */}
        {mode === 'create' && <ComandaMaterialsCreateSection colors={colors} />}

        {/* ── DESCONTO ── */}
        {selectedService && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-4 space-y-3">
            <p className={sectionHeaderCls}>Desconto</p>
            <div className="flex gap-2">
              {(['', 'fixed', 'percent'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setDiscountType(t)
                    setDiscountValue('')
                  }}
                  className={`text-xs rounded-lg px-3 py-1.5 border transition-colors ${
                    discountType === t
                      ? 'bg-tracy-gold text-tracy-bg border-tracy-gold font-semibold'
                      : 'border-tracy-border text-tracy-muted hover:border-tracy-muted hover:text-tracy-text'
                  }`}
                >
                  {t === '' ? 'Sem desconto' : t === 'fixed' ? 'R$ fixo' : '% porcentagem'}
                </button>
              ))}
            </div>

            {discountType !== '' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-tracy-muted shrink-0">
                    {discountType === 'fixed' ? 'R$' : '%'}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'fixed' ? '0,00' : '0'}
                    className={`flex-1 bg-tracy-bg border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none ${discountLimitError ? 'border-red-400 focus:border-red-400' : 'border-tracy-border focus:border-tracy-gold'}`}
                  />
                  {discountAmount > 0 && !discountLimitError && (
                    <span className="text-xs text-red-400 shrink-0 tabular-nums">
                      − {formatBRL(discountAmount)}
                    </span>
                  )}
                </div>
                {discountLimitError && (
                  <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                    {discountLimitError}
                  </p>
                )}
              </>
            )}

            {/* Inputs ocultos para serializar no FormData */}
            <input type="hidden" name="discount_type" value={discountType} />
            <input type="hidden" name="discount_value" value={discountValue} />
          </div>
        )}

        {/* ── SINAL ── */}
        {selectedService && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-4 space-y-3">
            <p className={sectionHeaderCls}>Sinal</p>

            {depositLocked && (
              <p
                className="text-[11px] text-tracy-muted border border-tracy-border rounded-lg px-3 py-2"
                title={initialData?.hasActiveSinal ? 'Sinal já recebido — não pode ser alterado.' : 'O sinal é definido na criação da comanda.'}
              >
                {initialData?.hasActiveSinal
                  ? 'Sinal já recebido — não pode ser alterado.'
                  : 'O sinal é definido na criação da comanda.'}
              </p>
            )}

            <div className={`flex gap-2 ${depositLocked ? 'opacity-50' : ''}`}>
              {(['', 'fixed', 'percent'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={depositLocked}
                  onClick={() => { setDepositType(t); setDepositValue('') }}
                  className={`text-xs rounded-lg px-3 py-1.5 border transition-colors disabled:cursor-not-allowed ${
                    depositType === t
                      ? 'bg-tracy-gold text-tracy-bg border-tracy-gold font-semibold'
                      : 'border-tracy-border text-tracy-muted hover:border-tracy-muted hover:text-tracy-text'
                  }`}
                >
                  {t === '' ? 'Sem sinal' : t === 'fixed' ? 'R$ fixo' : '% porcentagem'}
                </button>
              ))}
            </div>

            {depositType !== '' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-tracy-muted shrink-0">
                  {depositType === 'fixed' ? 'R$' : '%'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositValue}
                  disabled={depositLocked}
                  onChange={(e) => setDepositValue(e.target.value)}
                  placeholder={depositType === 'fixed' ? '0,00' : '0'}
                  className="flex-1 bg-tracy-bg border border-tracy-border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            )}

            {depositType !== '' && parseFloat(depositValue) > 0 && (() => {
              const dv = parseFloat(depositValue) || 0
              const depositAmt = depositType === 'fixed' ? dv : finalTotal * (dv / 100)
              const restante = Math.max(0, finalTotal - depositAmt)
              return (
                <p className="text-xs text-tracy-muted">
                  Sinal: {formatBRL(depositAmt)} · Restante: {formatBRL(restante)}
                </p>
              )
            })()}

            {/* Forma de recebimento do sinal — obrigatória quando há sinal */}
            {depositType !== '' && (
              <div>
                <label htmlFor="deposit_payment_method_id" className="block text-xs text-tracy-muted mb-1.5">
                  Forma de recebimento do sinal
                </label>
                {paymentMethods.length === 0 ? (
                  <p className="text-xs text-tracy-muted">
                    Nenhuma forma de pagamento ativa.{' '}
                    <Link href="/admin/configuracoes" className="text-tracy-gold hover:underline">
                      Cadastrar em Configurações
                    </Link>
                  </p>
                ) : (
                  <select
                    id="deposit_payment_method_id"
                    value={depositPaymentMethodId}
                    disabled={depositLocked}
                    onChange={(e) => {
                      setDepositPaymentMethodId(e.target.value)
                      // Limpa dados de cartão se a nova forma não for crédito.
                      const k = paymentMethods.find((m) => m.id === e.target.value)?.kind
                      if (k !== 'credito') { setDepCardMachineId(''); setDepCardBrandId(''); setDepCardInstallmentId('') }
                    }}
                    className={`w-full bg-tracy-bg border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      depositError && !depositPaymentMethodId ? 'border-red-400 focus:border-red-400' : 'border-tracy-border focus:border-tracy-gold'
                    }`}
                  >
                    <option value="">Selecione…</option>
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Sinal no crédito: maquininha → bandeira → parcelamento (mesma UX do fechamento) */}
            {depositType !== '' && depositIsCredito && !depositLocked && (
              cardTree.length === 0 ? (
                <p className="text-[11px] text-tracy-muted">
                  Nenhuma maquininha cadastrada.{' '}
                  <Link href="/admin/configuracoes" className="text-tracy-gold hover:underline">Configurar maquininhas</Link>
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={depCardMachineId}
                      onChange={(e) => { setDepCardMachineId(e.target.value); setDepCardBrandId(''); setDepCardInstallmentId('') }}
                      className="bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-xs focus:outline-none focus:border-tracy-gold"
                    >
                      <option value="">Maquininha…</option>
                      {cardTree.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <select
                      value={depCardBrandId}
                      onChange={(e) => { setDepCardBrandId(e.target.value); setDepCardInstallmentId('') }}
                      disabled={!depMachine}
                      className="bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-xs focus:outline-none focus:border-tracy-gold disabled:opacity-40"
                    >
                      <option value="">Bandeira…</option>
                      {(depMachine?.brands ?? []).map((b) => <option key={b.id} value={b.id}>{CARD_BRAND_LABELS[b.brand]}</option>)}
                    </select>
                    <select
                      value={depCardInstallmentId}
                      onChange={(e) => setDepCardInstallmentId(e.target.value)}
                      disabled={!depBrand}
                      className="bg-tracy-bg border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-xs focus:outline-none focus:border-tracy-gold disabled:opacity-40"
                    >
                      <option value="">Parcelas…</option>
                      {(depBrand?.installments ?? []).map((inst) => (
                        <option key={inst.id} value={inst.id}>{inst.installments}x{inst.installments === 1 ? ' (à vista)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  {depFeePercent != null && (
                    <p className="text-[11px] text-tracy-muted">
                      Taxa: {depFeePercent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                      {depFeeValue != null && ` (${formatBRL(depFeeValue)})`}
                      {cardFeePassthrough && depFeeValue != null
                        ? ` · Cobrar no cartão: ${formatBRL(depositAmountNum + depFeeValue)}`
                        : ' · custo do salão, não cobrado da cliente'}
                    </p>
                  )}
                </div>
              )
            )}

            {/* Hidden inputs do cartão do sinal — só valem quando a forma é crédito */}
            <input type="hidden" name="deposit_card_machine_id" value={depositIsCredito ? depCardMachineId : ''} />
            <input type="hidden" name="deposit_card_brand_id" value={depositIsCredito ? depCardBrandId : ''} />
            <input type="hidden" name="deposit_card_installment_id" value={depositIsCredito ? depCardInstallmentId : ''} />

            {/* Data do recebimento do sinal — aparece quando há sinal e forma escolhida */}
            {depositType !== '' && depositPaymentMethodId && (
              <div>
                <label htmlFor="deposit_paid_at" className="block text-xs text-tracy-muted mb-1.5">
                  Data do recebimento do sinal
                </label>
                <input
                  id="deposit_paid_at"
                  type="date"
                  value={depositPaidAt}
                  max={defaultDate}
                  disabled={depositLocked}
                  onChange={(e) => setDepositPaidAt(e.target.value)}
                  className="w-full bg-tracy-bg border border-tracy-border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            )}

            {depositError && depositValue !== '' && (
              <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {depositError}
              </p>
            )}

            <input type="hidden" name="deposit_type" value={depositType} />
            <input type="hidden" name="deposit_value" value={depositValue} />
            <input type="hidden" name="deposit_payment_method_id" value={depositPaymentMethodId} />
            <input type="hidden" name="deposit_paid_at" value={depositPaidAt} />
          </div>
        )}

        {/* ── TOTAL ── */}
        {selectedService && (
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className={`${sectionHeaderCls} mb-0`}>Total</p>
              <div className="flex items-center gap-2">
                {isManualTotal && (
                  <span className="text-[10px] text-tracy-muted border border-tracy-border rounded px-1.5 py-0.5 uppercase tracking-wide">
                    manual
                  </span>
                )}
                <p className="text-2xl font-black tabular-nums text-tracy-text">
                  {formatBRL(finalTotal)}
                </p>
              </div>
            </div>

            {discountType !== '' && !isManualTotal && discountAmount > 0 && (
              <p className="text-xs text-tracy-muted">
                {formatBRL(basePrice)} − {formatBRL(discountAmount)} = {formatBRL(finalTotal)}
              </p>
            )}

            <label className="flex items-center gap-2 text-xs text-tracy-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showTotalOverride}
                onChange={(e) => {
                  setShowTotalOverride(e.target.checked)
                  if (!e.target.checked) setTotalOverride('')
                }}
                className="rounded accent-tracy-gold"
              />
              Editar total manualmente
            </label>

            {showTotalOverride && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-tracy-muted shrink-0">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalOverride}
                  onChange={(e) => setTotalOverride(e.target.value)}
                  placeholder={String(finalTotal.toFixed(2))}
                  className="flex-1 bg-tracy-bg border border-tracy-border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
                />
              </div>
            )}

            <input
              type="hidden"
              name="total_override"
              value={isManualTotal ? totalOverride : ''}
            />
          </div>
        )}

        {/* ── OBSERVAÇÕES ── */}
        <div>
          <label htmlFor="notes" className={labelCls}>
            Observações <span className="opacity-50">(opcional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={initialData?.notes ?? ''}
            className={inputCls + ' resize-none'}
            placeholder="Alguma observação para esta comanda…"
          />
        </div>

        {/* ── SUBMIT ── */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending || localClients.length === 0 || services.length === 0}
            className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50 transition-opacity"
          >
            {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar comanda'}
          </button>
          {onCancel ? (
            // Em modal (criar ou editar) o cancelar fecha o modal sem navegar (preserva o ?date=).
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-tracy-muted hover:text-tracy-text transition-colors"
            >
              {isEdit ? 'Cancelar edição' : 'Cancelar'}
            </button>
          ) : (
            <Link
              href="/admin/agenda"
              className="text-sm text-tracy-muted hover:text-tracy-text transition-colors"
            >
              Cancelar
            </Link>
          )}
        </div>
      </form>

      {/* ── MODAL — Novo cliente ── */}
      {showNewClientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-tracy-surface border border-tracy-border rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-base font-black text-tracy-text mb-4">Novo cliente</h2>
            <form onSubmit={handleNewClientSubmit} className="space-y-3">
              {newClientError && (
                <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {newClientError}
                </p>
              )}
              <div>
                <label className={labelCls}>Nome *</label>
                <input
                  name="name"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className={inputCls}
                  placeholder="Nome completo"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Telefone <span className="opacity-50">(opcional)</span></label>
                <input
                  name="phone"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className={inputCls}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={clientPending}
                  className="flex-1 bg-tracy-gold text-tracy-bg font-semibold rounded-lg py-2 text-sm disabled:opacity-50"
                >
                  {clientPending ? 'Salvando…' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewClientModal(false)
                    setNewClientError(null)
                    setNewClientName('')
                    setNewClientPhone('')
                  }}
                  className="flex-1 border border-tracy-border text-tracy-muted hover:text-tracy-text rounded-lg py-2 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
