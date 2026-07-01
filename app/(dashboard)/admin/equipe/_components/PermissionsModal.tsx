'use client'

import { useState, useTransition } from 'react'
import { updateTeamMemberPermissions } from '@/app/actions/team'
import type { UserRole } from '@/lib/types/database'

interface Props {
  memberId: string
  memberName: string
  memberRole: UserRole
  // Permissões atuais do membro
  canCreateAppointments: boolean
  canCloseAppointments: boolean
  canViewOtherAgendas: boolean
  canManageClients: boolean
  canViewOtherClients: boolean
  canManageCatalogServices: boolean
  canManageCatalogProducts: boolean
  canViewFinancial: boolean
  canEditCommission: boolean
  discountLimitPercent: number | null
  // Controle de acesso ao modal
  canManage: boolean
  isSelf: boolean
  onClose: () => void
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  label: string
  description: string
}) {
  return (
    <label className={`flex items-start gap-4 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <div className="relative mt-0.5 shrink-0">
        <div
          onClick={() => { if (!disabled) onChange(!checked) }}
          className={`w-10 h-6 rounded-full transition-colors border ${
            checked ? 'bg-tracy-gold border-tracy-gold' : 'bg-transparent border-tracy-border'
          } ${disabled ? 'opacity-40' : ''}`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              checked ? 'left-5' : 'left-1'
            }`}
          />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${disabled ? 'text-tracy-muted' : 'text-tracy-text'}`}>
          {label}
        </p>
        <p className="text-xs text-tracy-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </label>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-3">
      {children}
    </p>
  )
}

export function PermissionsModal({
  memberId,
  memberName,
  memberRole,
  canCreateAppointments,
  canCloseAppointments,
  canViewOtherAgendas,
  canManageClients,
  canViewOtherClients,
  canManageCatalogServices,
  canManageCatalogProducts,
  canViewFinancial,
  canEditCommission,
  discountLimitPercent,
  canManage,
  isSelf,
  onClose,
}: Props) {
  const [localCreate, setLocalCreate] = useState(canCreateAppointments)
  const [localClose, setLocalClose] = useState(canCloseAppointments)
  const [localOtherAgendas, setLocalOtherAgendas] = useState(canViewOtherAgendas)
  const [localClients, setLocalClients] = useState(canManageClients)
  const [localOtherClients, setLocalOtherClients] = useState(canViewOtherClients)
  const [localCatalogServices, setLocalCatalogServices] = useState(canManageCatalogServices)
  const [localCatalogProducts, setLocalCatalogProducts] = useState(canManageCatalogProducts)
  const [localFinancial, setLocalFinancial] = useState(canViewFinancial)
  const [localEditCommission, setLocalEditCommission] = useState(canEditCommission)
  const [localDiscount, setLocalDiscount] = useState<number | null>(discountLimitPercent)

  // Dono/gerente sempre podem editar override por código — a flag só faz sentido para os demais papéis.
  const showEditCommission = memberRole !== 'dono' && memberRole !== 'gerente'
  const [discountInput, setDiscountInput] = useState(
    discountLimitPercent !== null ? String(discountLimitPercent) : ''
  )

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const readOnly = !canManage || isSelf

  function handleDiscountChange(val: string) {
    setDiscountInput(val)
    setLocalDiscount(val === '' ? null : parseFloat(val) || null)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateTeamMemberPermissions(memberId, {
        can_create_appointments: localCreate,
        can_close_appointments: localClose,
        can_view_other_agendas: localOtherAgendas,
        can_manage_clients: localClients,
        can_view_other_clients: localOtherClients,
        can_manage_catalog_services: localCatalogServices,
        can_manage_catalog_products: localCatalogProducts,
        can_view_financial: localFinancial,
        can_edit_commission: localEditCommission,
        discount_limit_percent: localDiscount,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
      <div className="bg-tracy-surface border border-tracy-border rounded-xl w-full max-w-md my-auto">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-tracy-border">
          <div>
            <p className="text-[11px] text-tracy-muted uppercase tracking-widest mb-0.5">Permissões</p>
            <h2 className="text-base font-bold text-tracy-text leading-tight">{memberName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-tracy-muted hover:text-tracy-text transition-colors text-lg leading-none"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Aviso de self-lockout */}
        {isSelf && (
          <div className="mx-6 mt-4 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-blue-300 text-sm">
              Você não pode alterar suas próprias permissões.
            </p>
          </div>
        )}

        {/* Corpo */}
        <div className="px-6 py-5 space-y-6">

          {/* Agenda e comandas */}
          <div>
            <SectionTitle>Agenda e comandas</SectionTitle>
            <div className="space-y-4">
              <Toggle checked={localCreate} onChange={setLocalCreate} disabled={readOnly}
                label="Pode criar comanda"
                description="Permite criar e editar comandas. Para cadastrar clientes inline, é necessário também gerenciar clientes."
              />
              <Toggle checked={localClose} onChange={setLocalClose} disabled={readOnly}
                label="Pode fechar comanda"
                description="Fecha a comanda para novas alterações. Só quem tem esta permissão pode reabrir."
              />
              <Toggle checked={localOtherAgendas} onChange={setLocalOtherAgendas} disabled={readOnly}
                label="Pode ver agenda das colegas"
                description="Visualiza comandas de todas as profissionais, não só as próprias."
              />
            </div>
          </div>

          {/* Clientes */}
          <div>
            <SectionTitle>Clientes</SectionTitle>
            <div className="space-y-4">
              <Toggle checked={localClients} onChange={setLocalClients} disabled={readOnly}
                label="Pode gerenciar clientes"
                description="Libera o módulo Clientes no menu e o cadastro de novos clientes."
              />
              <Toggle checked={localOtherClients} onChange={setLocalOtherClients} disabled={readOnly}
                label="Pode ver todos os clientes"
                description="Exibe histórico de qualquer cliente, não só os atendidos por ela."
              />
            </div>
          </div>

          {/* Catálogo */}
          <div>
            <SectionTitle>Catálogo</SectionTitle>
            <div className="space-y-4">
              <Toggle checked={localCatalogServices} onChange={setLocalCatalogServices} disabled={readOnly}
                label="Pode gerenciar serviços"
                description="Cria, edita e remove categorias e serviços do catálogo."
              />
              <Toggle checked={localCatalogProducts} onChange={setLocalCatalogProducts} disabled={readOnly}
                label="Pode gerenciar produtos"
                description="Gestão de estoque — disponível na fase 2."
              />
            </div>
          </div>

          {/* Financeiro */}
          <div>
            <SectionTitle>Financeiro</SectionTitle>
            <div className="space-y-4">
              <Toggle checked={localFinancial} onChange={setLocalFinancial} disabled={readOnly}
                label="Pode acessar o Financeiro"
                description="Libera o módulo Financeiro (lançamentos, comissões a pagar e mais). O dono sempre tem acesso."
              />
              {showEditCommission && (
                <Toggle checked={localEditCommission} onChange={setLocalEditCommission} disabled={readOnly}
                  label="Pode editar comissão por comanda"
                  description="Libera o override de comissão direto na comanda. Dono e gerente já podem por padrão."
                />
              )}
              <div>
                <p className={`text-sm font-semibold mb-1 ${readOnly ? 'text-tracy-muted' : 'text-tracy-text'}`}>
                  Limite de desconto (%)
                </p>
                <p className="text-xs text-tracy-muted mb-2">
                  Máximo que pode conceder em uma comanda. Vazio = sem limite.
                </p>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={discountInput}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  disabled={readOnly}
                  placeholder="Sem limite"
                  className="w-28 bg-tracy-bg border border-tracy-border rounded-lg px-3 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold disabled:opacity-40"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-3 px-6 pb-5 pt-2 border-t border-tracy-border">
          <button
            onClick={onClose}
            className="text-sm text-tracy-muted border border-tracy-border rounded-lg px-4 py-2 hover:text-tracy-text hover:border-tracy-muted transition-colors"
          >
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={isPending}
              className="text-sm bg-tracy-gold text-black font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
